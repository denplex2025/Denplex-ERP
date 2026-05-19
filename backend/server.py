from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import bcrypt
import jwt
import uuid
import base64
import io
import csv
import asyncio
import secrets
import pyotp
import phonenumbers
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal, Any, Dict
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException
from email.message import EmailMessage
from email.utils import parseaddr, parsedate_to_datetime
from email.header import decode_header
import smtplib
import imaplib
import email as emaillib
import re
import ssl
import hashlib
from cryptography.fernet import Fernet, InvalidToken

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Denplex ERP")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Trial role write-guard middleware: trial users cannot mutate (DELETE/PUT/PATCH) on /api/*
@app.middleware("http")
async def trial_write_guard(request: Request, call_next):
    if request.url.path.startswith("/api") and request.method in ("DELETE", "PUT", "PATCH"):
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            try:
                token = auth.split(" ", 1)[1]
                payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                if payload.get("role") == "trial":
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "Trial accounts have view + create access only. Editing and deleting are disabled during the 1-month trial. Please contact admin@denplex.co for a full license."},
                    )
            except Exception:
                pass
    return await call_next(request)

ROLES = ["admin", "manager", "production", "qc", "accountant", "ca", "sales", "employee", "trial"]

# ---------------- helpers ----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), h.encode())
    except Exception:
        return False

def create_token(uid: str, role: str) -> str:
    payload = {"sub": uid, "role": role, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Dict[str, Any]:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0, "totp_secret": 0})
    if not user:
        raise HTTPException(401, "User not found")
    # enforce trial expiry
    exp = user.get("trial_expires_at")
    if exp:
        try:
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                raise HTTPException(403, "Trial expired. Please contact admin@denplex.co to extend your access.")
        except HTTPException:
            raise
        except Exception:
            pass
    return user

async def require_can_edit(request: Request, user=Depends(get_current_user)) -> Dict[str, Any]:
    # Trial users cannot DELETE/PUT/PATCH on most endpoints
    if user.get("role") == "trial" and request.method in ("DELETE", "PUT", "PATCH"):
        raise HTTPException(403, "Trial accounts have view + create access only. Editing and deleting are disabled during the 1-month trial.")
    return user

def require_roles(*allowed: str):
    async def checker(user: Dict[str, Any] = Depends(get_current_user)):
        if user["role"] not in allowed and user["role"] != "admin":
            raise HTTPException(403, "Insufficient permissions")
        return user
    return checker

async def next_seq(name: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return doc["seq"] if doc else 1

async def gen_code(prefix: str, name: str) -> str:
    n = await next_seq(name)
    year = datetime.now(timezone.utc).strftime("%y")
    return f"{prefix}-{year}-{n:04d}"

# ---------------- Models ----------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["admin", "manager", "production", "qc", "accountant", "ca", "sales", "employee", "trial"] = "employee"

class TrialRequestIn(BaseModel):
    name: str
    company: str
    phone: str
    email: EmailStr
    gstin: Optional[str] = ""
    business_type: Optional[str] = ""
    purpose: Optional[str] = ""

class TrialApproveIn(BaseModel):
    note: Optional[str] = ""

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = ""

class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    name: str
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    gstin: Optional[str] = ""
    address: Optional[str] = ""
    customer_type: Literal["repeat", "one_time"] = "one_time"
    orders_count: int = 0
    created_at: str = Field(default_factory=now_iso)

class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    company: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    source: Optional[str] = "manual"  # manual, b2b, website
    requirement: Optional[str] = ""
    status: Literal["new", "contacted", "qualified", "converted", "lost"] = "new"
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class Supplier(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    gstin: Optional[str] = ""
    address: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    sku: str
    name: str
    category: Optional[str] = "raw"  # raw, wip, finished, tool, consumable
    uom: str = "pcs"
    qty_on_hand: float = 0
    qty_in_process: float = 0
    reorder_level: float = 0
    unit_cost: float = 0
    hsn: Optional[str] = ""
    gst_rate: float = 18.0
    location: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class StockMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    item_id: str
    item_sku: str
    item_name: str
    type: Literal["in", "out", "adjust", "in_process"]
    qty: float
    ref: Optional[str] = ""
    notes: Optional[str] = ""
    by_user: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class BOMLine(BaseModel):
    item_id: str
    item_name: str
    qty: float
    uom: str = "pcs"

class BOM(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    product_name: str
    description: Optional[str] = ""
    design_code: Optional[str] = ""
    solidworks_url: Optional[str] = ""
    lines: List[BOMLine] = []
    created_at: str = Field(default_factory=now_iso)

class WorkOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    bom_id: Optional[str] = ""
    product: str
    qty: float
    po_ref: Optional[str] = ""
    status: Literal["planned", "in_progress", "qc", "completed", "on_hold", "cancelled"] = "planned"
    priority: Literal["low", "medium", "high"] = "medium"
    start_date: Optional[str] = ""
    due_date: Optional[str] = ""
    notes: Optional[str] = ""
    progress: int = 0
    created_at: str = Field(default_factory=now_iso)

class JobCard(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    work_order_id: str
    work_order_code: Optional[str] = ""
    operation: str
    machine: Optional[str] = ""
    operator: Optional[str] = ""
    qty_planned: float = 0
    qty_done: float = 0
    status: Literal["pending", "in_progress", "done"] = "pending"
    started_at: Optional[str] = ""
    finished_at: Optional[str] = ""
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class QuoteLine(BaseModel):
    description: str
    qty: float
    rate: float
    gst_rate: float = 18.0

class Quotation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    customer_id: str
    customer_name: str
    date: str = Field(default_factory=now_iso)
    valid_until: Optional[str] = ""
    lines: List[QuoteLine] = []
    subtotal: float = 0
    gst_total: float = 0
    total: float = 0
    status: Literal["draft", "sent", "accepted", "rejected"] = "draft"
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class POLine(BaseModel):
    description: str
    qty: float
    rate: float
    gst_rate: float = 18.0

class PurchaseOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    supplier_id: str
    supplier_name: str
    date: str = Field(default_factory=now_iso)
    delivery_date: Optional[str] = ""
    lines: List[POLine] = []
    subtotal: float = 0
    gst_total: float = 0
    total: float = 0
    status: Literal["draft", "sent", "received", "cancelled"] = "draft"
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class InvoiceLine(BaseModel):
    description: str
    hsn: Optional[str] = ""
    qty: float
    rate: float
    gst_rate: float = 18.0

class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    customer_id: str
    customer_name: str
    customer_gstin: Optional[str] = ""
    place_of_supply: Optional[str] = ""
    is_interstate: bool = False
    date: str = Field(default_factory=now_iso)
    due_date: Optional[str] = ""
    lines: List[InvoiceLine] = []
    subtotal: float = 0
    cgst: float = 0
    sgst: float = 0
    igst: float = 0
    total: float = 0
    status: Literal["draft", "sent", "paid", "overdue"] = "draft"
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class QCReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    work_order_id: Optional[str] = ""
    work_order_code: Optional[str] = ""
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    inspector: Optional[str] = ""
    inspection_date: str = Field(default_factory=now_iso)
    parameter: str
    spec: Optional[str] = ""
    measured: Optional[str] = ""
    result: Literal["pass", "fail", "rework"] = "pass"
    photos: List[str] = []  # base64 strings
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class DocumentMeta(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    category: Optional[str] = "general"  # general, iso, drawing, qc, packaging
    linked_to: Optional[str] = ""  # work_order_id / invoice_id etc
    linked_type: Optional[str] = ""
    file_base64: str  # data URL
    mime: Optional[str] = ""
    size: int = 0
    uploaded_by: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class BillScanIn(BaseModel):
    image_base64: str  # raw base64 (no data URL prefix) or data URL
    mime: str = "image/jpeg"

# ---------------- P1: Accounting / HR / Marketing models ----------------
class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    date: str = Field(default_factory=now_iso)
    category: str = "general"
    description: str
    vendor: Optional[str] = ""
    amount: float = 0
    gst_rate: float = 0
    gst_amount: float = 0
    total: float = 0
    payment_mode: Optional[str] = "bank"
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class Employee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    code: Optional[str] = None
    name: str
    designation: Optional[str] = ""
    department: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    join_date: Optional[str] = ""
    monthly_salary: float = 0
    status: Literal["active", "inactive"] = "active"
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    employee_id: str
    employee_name: Optional[str] = ""
    date: str
    status: Literal["present", "absent", "half_day", "leave"] = "present"
    hours: float = 8
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class Campaign(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    title: str
    channel: Literal["whatsapp", "instagram", "linkedin", "facebook", "email", "other"] = "whatsapp"
    content: Optional[str] = ""
    scheduled_for: Optional[str] = ""
    status: Literal["draft", "scheduled", "published"] = "draft"
    metrics: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)

class DocRevIn(BaseModel):
    file_base64: str
    notes: Optional[str] = ""

# ---------------- Auth ----------------
@api.post("/auth/register")
async def register(payload: RegisterIn, current=Depends(get_current_user)):
    if current["role"] != "admin":
        raise HTTPException(403, "Only admin can register users")
    if await db.users.find_one({"email": payload.email.lower()}):
        raise HTTPException(400, "Email already exists")
    user = {
        "id": new_id(),
        "name": payload.name,
        "email": payload.email.lower(),
        "role": payload.role,
        "password": hash_password(payload.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    user.pop("_id", None); user.pop("password", None)
    return user

@api.post("/auth/login")
async def login(payload: LoginIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password"]):
        raise HTTPException(401, "Invalid credentials")
    # Trial expiry check at login
    exp = user.get("trial_expires_at")
    if exp:
        try:
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                raise HTTPException(403, "Trial expired. Please contact admin@denplex.co to extend your access.")
        except HTTPException:
            raise
        except Exception:
            pass
    if user.get("totp_enabled"):
        if not payload.totp_code:
            raise HTTPException(401, "TOTP code required", headers={"X-2FA-Required": "1"})
        if not pyotp.TOTP(user.get("totp_secret", "")).verify(payload.totp_code, valid_window=1):
            raise HTTPException(401, "Invalid TOTP code")
    token = create_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"],
            "trial_expires_at": user.get("trial_expires_at", ""),
        }
    }

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

class ChangePwIn(BaseModel):
    current_password: str
    new_password: str

@api.post("/auth/change-password")
async def change_password(payload: ChangePwIn, user=Depends(get_current_user)):
    if len(payload.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    u = await db.users.find_one({"id": user["id"]})
    if not u or not verify_password(payload.current_password, u["password"]):
        raise HTTPException(401, "Current password is incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": hash_password(payload.new_password)}})
    await write_audit(user["name"], "password_changed", "user", user["id"])
    return {"ok": True}

@api.get("/users")
async def list_users(user=Depends(require_roles("admin"))):
    return await db.users.find({}, {"_id": 0, "password": 0, "totp_secret": 0}).to_list(500)

# ---------------- Generic CRUD helpers ----------------
def serialize(d: Dict[str, Any]) -> Dict[str, Any]:
    d.pop("_id", None)
    return d

async def list_collection(coll, query: Dict = None, sort_key: str = "created_at"):
    cursor = coll.find(query or {}, {"_id": 0}).sort(sort_key, -1)
    return await cursor.to_list(2000)

# ---------------- Customers ----------------
@api.post("/customers")
async def create_customer(c: Customer, user=Depends(get_current_user)):
    doc = c.model_dump()
    doc["code"] = await gen_code("CUST", "customer")
    await db.customers.insert_one(doc)
    return serialize(doc)

@api.get("/customers")
async def list_customers(user=Depends(get_current_user)):
    return await list_collection(db.customers)

@api.put("/customers/{cid}")
async def update_customer(cid: str, c: Customer, user=Depends(get_current_user)):
    data = c.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.customers.update_one({"id": cid}, {"$set": data})
    return {"ok": True}

@api.delete("/customers/{cid}")
async def del_customer(cid: str, user=Depends(require_roles("admin", "manager"))):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}

# ---------------- Leads ----------------
@api.post("/leads")
async def create_lead(l: Lead, user=Depends(get_current_user)):
    doc = l.model_dump()
    await db.leads.insert_one(doc)
    return serialize(doc)

@api.get("/leads")
async def list_leads(user=Depends(get_current_user)):
    return await list_collection(db.leads)

@api.put("/leads/{lid}")
async def update_lead(lid: str, l: Lead, user=Depends(get_current_user)):
    data = l.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.leads.update_one({"id": lid}, {"$set": data})
    return {"ok": True}

@api.delete("/leads/{lid}")
async def del_lead(lid: str, user=Depends(get_current_user)):
    await db.leads.delete_one({"id": lid})
    return {"ok": True}

# ---------------- Suppliers ----------------
@api.post("/suppliers")
async def create_supplier(s: Supplier, user=Depends(get_current_user)):
    doc = s.model_dump()
    await db.suppliers.insert_one(doc)
    return serialize(doc)

@api.get("/suppliers")
async def list_suppliers(user=Depends(get_current_user)):
    return await list_collection(db.suppliers)

@api.put("/suppliers/{sid}")
async def update_supplier(sid: str, s: Supplier, user=Depends(get_current_user)):
    data = s.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.suppliers.update_one({"id": sid}, {"$set": data})
    return {"ok": True}

@api.delete("/suppliers/{sid}")
async def del_supplier(sid: str, user=Depends(get_current_user)):
    await db.suppliers.delete_one({"id": sid})
    return {"ok": True}

# ---------------- Inventory ----------------
@api.post("/inventory/items")
async def create_item(it: InventoryItem, user=Depends(get_current_user)):
    if await db.items.find_one({"sku": it.sku}):
        raise HTTPException(400, "SKU already exists")
    doc = it.model_dump()
    await db.items.insert_one(doc)
    return serialize(doc)

@api.get("/inventory/items")
async def list_items(user=Depends(get_current_user)):
    return await list_collection(db.items, sort_key="name")

@api.put("/inventory/items/{iid}")
async def update_item(iid: str, it: InventoryItem, user=Depends(get_current_user)):
    data = it.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.items.update_one({"id": iid}, {"$set": data})
    return {"ok": True}

@api.delete("/inventory/items/{iid}")
async def del_item(iid: str, user=Depends(require_roles("admin", "manager"))):
    await db.items.delete_one({"id": iid})
    return {"ok": True}

@api.post("/inventory/movements")
async def create_movement(m: StockMovement, user=Depends(get_current_user)):
    item = await db.items.find_one({"id": m.item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item not found")
    qty = float(m.qty)
    new_oh = item["qty_on_hand"]
    new_ip = item.get("qty_in_process", 0)
    if m.type == "in":
        new_oh += qty
    elif m.type == "out":
        new_oh -= qty
    elif m.type == "adjust":
        new_oh = qty
    elif m.type == "in_process":
        new_ip += qty
        new_oh -= qty
    await db.items.update_one({"id": m.item_id}, {"$set": {"qty_on_hand": new_oh, "qty_in_process": new_ip}})
    doc = m.model_dump()
    doc["item_sku"] = item["sku"]
    doc["item_name"] = item["name"]
    doc["by_user"] = user["name"]
    await db.movements.insert_one(doc)
    return serialize(doc)

@api.get("/inventory/movements")
async def list_movements(user=Depends(get_current_user)):
    return await list_collection(db.movements)

@api.post("/inventory/scan-bill")
async def scan_bill(payload: BillScanIn, user=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key not configured")
    b64 = payload.image_base64
    if "," in b64 and b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"bill-{new_id()}",
            system_message="You are an expert at extracting structured data from Indian supplier purchase bills/invoices. Return ONLY valid JSON, no markdown fences."
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        prompt = (
            "Extract the bill into JSON with keys: supplier_name, supplier_gstin, bill_number, bill_date, "
            "items (array of {description, hsn, qty, uom, rate, amount, gst_rate}), subtotal, cgst, sgst, igst, total. "
            "Use empty string if a field is missing. Use 0 for missing numbers. Output ONLY the JSON object."
        )
        msg = UserMessage(text=prompt, file_contents=[ImageContent(image_base64=b64)])
        resp = await chat.send_message(msg)
        text = str(resp).strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
            text = text.strip()
        import json
        try:
            data = json.loads(text)
        except Exception:
            # try to find JSON substring
            s = text.find("{"); e = text.rfind("}")
            data = json.loads(text[s:e+1]) if s != -1 and e != -1 else {"raw": text}
        return {"ok": True, "extracted": data}
    except Exception as ex:
        logger.exception("scan-bill failed")
        raise HTTPException(500, f"AI extraction failed: {ex}")

# ---------------- BOM ----------------
@api.post("/bom")
async def create_bom(b: BOM, user=Depends(get_current_user)):
    doc = b.model_dump()
    doc["code"] = await gen_code("BOM", "bom")
    if not doc.get("design_code"):
        doc["design_code"] = f"DSGN-{datetime.now(timezone.utc).strftime('%y%m')}-{await next_seq('design'):04d}"
    await db.boms.insert_one(doc)
    return serialize(doc)

@api.get("/bom")
async def list_bom(user=Depends(get_current_user)):
    return await list_collection(db.boms)

@api.put("/bom/{bid}")
async def update_bom(bid: str, b: BOM, user=Depends(get_current_user)):
    data = b.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.boms.update_one({"id": bid}, {"$set": data})
    return {"ok": True}

@api.delete("/bom/{bid}")
async def del_bom(bid: str, user=Depends(get_current_user)):
    await db.boms.delete_one({"id": bid})
    return {"ok": True}

# ---------------- Work Orders ----------------
@api.post("/work-orders")
async def create_wo(w: WorkOrder, user=Depends(get_current_user)):
    doc = w.model_dump()
    doc["code"] = await gen_code("WO", "wo")
    await db.work_orders.insert_one(doc)
    if doc.get("customer_id"):
        await db.customers.update_one({"id": doc["customer_id"]}, {"$inc": {"orders_count": 1}})
        cust = await db.customers.find_one({"id": doc["customer_id"]}, {"_id": 0})
        if cust and cust.get("orders_count", 0) >= 2:
            await db.customers.update_one({"id": doc["customer_id"]}, {"$set": {"customer_type": "repeat"}})
    return serialize(doc)

@api.get("/work-orders")
async def list_wo(user=Depends(get_current_user)):
    return await list_collection(db.work_orders)

@api.put("/work-orders/{wid}")
async def update_wo(wid: str, w: WorkOrder, user=Depends(get_current_user)):
    data = w.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.work_orders.update_one({"id": wid}, {"$set": data})
    return {"ok": True}

@api.delete("/work-orders/{wid}")
async def del_wo(wid: str, user=Depends(require_roles("admin", "manager"))):
    await db.work_orders.delete_one({"id": wid})
    return {"ok": True}

# ---------------- Job Cards ----------------
@api.post("/job-cards")
async def create_jc(j: JobCard, user=Depends(get_current_user)):
    doc = j.model_dump()
    doc["code"] = await gen_code("JC", "jc")
    wo = await db.work_orders.find_one({"id": j.work_order_id}, {"_id": 0})
    if wo:
        doc["work_order_code"] = wo.get("code", "")
    await db.job_cards.insert_one(doc)
    return serialize(doc)

@api.get("/job-cards")
async def list_jc(user=Depends(get_current_user)):
    return await list_collection(db.job_cards)

@api.put("/job-cards/{jid}")
async def update_jc(jid: str, j: JobCard, user=Depends(get_current_user)):
    data = j.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.job_cards.update_one({"id": jid}, {"$set": data})
    return {"ok": True}

@api.delete("/job-cards/{jid}")
async def del_jc(jid: str, user=Depends(get_current_user)):
    await db.job_cards.delete_one({"id": jid})
    return {"ok": True}

# ---------------- Helper: totals ----------------
def compute_totals(lines: List[Dict[str, Any]]) -> Dict[str, float]:
    subtotal = 0.0; gst_total = 0.0
    for l in lines:
        amt = float(l.get("qty", 0)) * float(l.get("rate", 0))
        gst = amt * float(l.get("gst_rate", 0)) / 100.0
        subtotal += amt; gst_total += gst
    return {"subtotal": round(subtotal, 2), "gst_total": round(gst_total, 2), "total": round(subtotal + gst_total, 2)}

# ---------------- Quotations ----------------
@api.post("/quotations")
async def create_quote(q: Quotation, user=Depends(get_current_user)):
    doc = q.model_dump()
    doc["code"] = await gen_code("QT", "quote")
    t = compute_totals([l for l in doc["lines"]])
    doc.update(t)
    await db.quotations.insert_one(doc)
    return serialize(doc)

@api.get("/quotations")
async def list_quotes(user=Depends(get_current_user)):
    return await list_collection(db.quotations)

@api.put("/quotations/{qid}")
async def update_quote(qid: str, q: Quotation, user=Depends(get_current_user)):
    data = q.model_dump(); data.pop("id", None); data.pop("created_at", None)
    t = compute_totals(data["lines"]); data.update(t)
    await db.quotations.update_one({"id": qid}, {"$set": data})
    return {"ok": True}

@api.delete("/quotations/{qid}")
async def del_quote(qid: str, user=Depends(get_current_user)):
    await db.quotations.delete_one({"id": qid})
    return {"ok": True}

# ---------------- Purchase Orders ----------------
@api.post("/purchase-orders")
async def create_po(p: PurchaseOrder, user=Depends(get_current_user)):
    doc = p.model_dump()
    doc["code"] = await gen_code("PO", "po")
    t = compute_totals(doc["lines"]); doc.update(t)
    await db.purchase_orders.insert_one(doc)
    return serialize(doc)

@api.get("/purchase-orders")
async def list_po(user=Depends(get_current_user)):
    return await list_collection(db.purchase_orders)

@api.put("/purchase-orders/{pid}")
async def update_po(pid: str, p: PurchaseOrder, user=Depends(get_current_user)):
    data = p.model_dump(); data.pop("id", None); data.pop("created_at", None)
    t = compute_totals(data["lines"]); data.update(t)
    await db.purchase_orders.update_one({"id": pid}, {"$set": data})
    return {"ok": True}

@api.delete("/purchase-orders/{pid}")
async def del_po(pid: str, user=Depends(require_roles("admin", "manager"))):
    await db.purchase_orders.delete_one({"id": pid})
    return {"ok": True}

# ---------------- Invoices ----------------
def compute_invoice_totals(lines: List[Dict[str, Any]], interstate: bool) -> Dict[str, float]:
    subtotal = 0.0; gst = 0.0
    for l in lines:
        amt = float(l.get("qty", 0)) * float(l.get("rate", 0))
        g = amt * float(l.get("gst_rate", 0)) / 100.0
        subtotal += amt; gst += g
    if interstate:
        return {"subtotal": round(subtotal, 2), "cgst": 0.0, "sgst": 0.0, "igst": round(gst, 2), "total": round(subtotal + gst, 2)}
    return {"subtotal": round(subtotal, 2), "cgst": round(gst/2, 2), "sgst": round(gst/2, 2), "igst": 0.0, "total": round(subtotal + gst, 2)}

@api.post("/invoices")
async def create_invoice(inv: Invoice, user=Depends(get_current_user)):
    doc = inv.model_dump()
    doc["code"] = await gen_code("INV", "invoice")
    doc.update(compute_invoice_totals(doc["lines"], doc.get("is_interstate", False)))
    await db.invoices.insert_one(doc)
    return serialize(doc)

@api.get("/invoices")
async def list_invoices(user=Depends(get_current_user)):
    return await list_collection(db.invoices)

@api.put("/invoices/{iid}")
async def update_invoice(iid: str, inv: Invoice, user=Depends(get_current_user)):
    data = inv.model_dump(); data.pop("id", None); data.pop("created_at", None)
    data.update(compute_invoice_totals(data["lines"], data.get("is_interstate", False)))
    await db.invoices.update_one({"id": iid}, {"$set": data})
    return {"ok": True}

@api.delete("/invoices/{iid}")
async def del_invoice(iid: str, user=Depends(require_roles("admin", "manager", "accountant", "ca"))):
    await db.invoices.delete_one({"id": iid})
    return {"ok": True}

# ---------------- QC Reports ----------------
@api.post("/qc-reports")
async def create_qc(q: QCReport, user=Depends(get_current_user)):
    doc = q.model_dump()
    doc["code"] = await gen_code("QC", "qc")
    if q.work_order_id:
        wo = await db.work_orders.find_one({"id": q.work_order_id}, {"_id": 0})
        if wo:
            doc["work_order_code"] = wo.get("code", "")
            doc["customer_id"] = doc.get("customer_id") or wo.get("customer_id", "")
            doc["customer_name"] = doc.get("customer_name") or wo.get("customer_name", "")
    await db.qc_reports.insert_one(doc)
    return serialize(doc)

@api.get("/qc-reports")
async def list_qc(user=Depends(get_current_user)):
    return await list_collection(db.qc_reports)

@api.delete("/qc-reports/{qid}")
async def del_qc(qid: str, user=Depends(require_roles("admin", "manager", "qc"))):
    await db.qc_reports.delete_one({"id": qid})
    return {"ok": True}

# ---------------- Documents ----------------
@api.post("/documents")
async def upload_doc(d: DocumentMeta, user=Depends(get_current_user)):
    doc = d.model_dump()
    doc["uploaded_by"] = user["name"]
    await db.documents.insert_one(doc)
    return serialize(doc)

@api.get("/documents")
async def list_docs(linked_to: Optional[str] = None, user=Depends(get_current_user)):
    q = {"linked_to": linked_to} if linked_to else {}
    return await db.documents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.delete("/documents/{did}")
async def del_doc(did: str, user=Depends(get_current_user)):
    await db.documents.delete_one({"id": did})
    return {"ok": True}

# ---------------- Dashboard ----------------
@api.get("/dashboard/stats")
async def dashboard_stats(user=Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).to_list(5000)
    low_stock = [i for i in items if i["qty_on_hand"] <= i.get("reorder_level", 0)]
    open_wo = await db.work_orders.count_documents({"status": {"$in": ["planned", "in_progress"]}})
    qc_pending = await db.work_orders.count_documents({"status": "qc"})
    leads_open = await db.leads.count_documents({"status": {"$in": ["new", "contacted", "qualified"]}})
    customers = await db.customers.count_documents({})
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(2000)
    revenue = sum([i.get("total", 0) for i in invoices if i.get("status") in ("paid", "sent")])
    repeat_customers = await db.customers.count_documents({"customer_type": "repeat"})
    # recent wo
    recent = await db.work_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(8)
    return {
        "open_wo": open_wo,
        "qc_pending": qc_pending,
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:10],
        "leads_open": leads_open,
        "customers": customers,
        "repeat_customers": repeat_customers,
        "revenue": round(revenue, 2),
        "items_count": len(items),
        "recent_wo": recent,
    }

# ---------------- P1: Accounting (Expenses + GST Report) ----------------
@api.post("/expenses")
async def create_expense(e: Expense, user=Depends(require_roles("admin", "manager", "accountant", "ca"))):
    doc = e.model_dump()
    amt = float(doc.get("amount") or 0)
    rate = float(doc.get("gst_rate") or 0)
    doc["gst_amount"] = round(amt * rate / 100.0, 2)
    doc["total"] = round(amt + doc["gst_amount"], 2)
    await db.expenses.insert_one(doc)
    return serialize(doc)

@api.get("/expenses")
async def list_expenses(user=Depends(require_roles("admin", "manager", "accountant", "ca"))):
    return await list_collection(db.expenses)

@api.delete("/expenses/{eid}")
async def del_expense(eid: str, user=Depends(require_roles("admin", "accountant", "ca"))):
    await db.expenses.delete_one({"id": eid})
    return {"ok": True}

@api.get("/accounting/gst-report")
async def gst_report(period_from: Optional[str] = None, period_to: Optional[str] = None,
                     user=Depends(require_roles("admin", "manager", "accountant", "ca"))):
    invq = {}
    if period_from or period_to:
        invq["date"] = {}
        if period_from: invq["date"]["$gte"] = period_from
        if period_to: invq["date"]["$lte"] = period_to
    invs = await db.invoices.find(invq, {"_id": 0}).to_list(5000)
    output_cgst = sum(i.get("cgst", 0) for i in invs)
    output_sgst = sum(i.get("sgst", 0) for i in invs)
    output_igst = sum(i.get("igst", 0) for i in invs)
    output_taxable = sum(i.get("subtotal", 0) for i in invs)

    exq = {}
    if period_from or period_to:
        exq["date"] = {}
        if period_from: exq["date"]["$gte"] = period_from
        if period_to: exq["date"]["$lte"] = period_to
    expenses = await db.expenses.find(exq, {"_id": 0}).to_list(5000)
    input_gst = sum(e.get("gst_amount", 0) for e in expenses)
    input_taxable = sum(e.get("amount", 0) for e in expenses)

    return {
        "period_from": period_from or "",
        "period_to": period_to or "",
        "output": {
            "taxable": round(output_taxable, 2),
            "cgst": round(output_cgst, 2),
            "sgst": round(output_sgst, 2),
            "igst": round(output_igst, 2),
            "total_gst": round(output_cgst + output_sgst + output_igst, 2),
            "invoice_count": len(invs),
        },
        "input": {
            "taxable": round(input_taxable, 2),
            "total_gst": round(input_gst, 2),
            "expense_count": len(expenses),
        },
        "net_liability": round((output_cgst + output_sgst + output_igst) - input_gst, 2),
    }

# ---------------- P1: HR (Employees + Attendance) ----------------
@api.post("/employees")
async def create_emp(e: Employee, user=Depends(require_roles("admin", "manager"))):
    doc = e.model_dump()
    doc["code"] = await gen_code("EMP", "employee")
    await db.employees.insert_one(doc)
    return serialize(doc)

@api.get("/employees")
async def list_emp(user=Depends(get_current_user)):
    return await list_collection(db.employees)

@api.put("/employees/{eid}")
async def upd_emp(eid: str, e: Employee, user=Depends(require_roles("admin", "manager"))):
    data = e.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.employees.update_one({"id": eid}, {"$set": data})
    return {"ok": True}

@api.delete("/employees/{eid}")
async def del_emp(eid: str, user=Depends(require_roles("admin"))):
    await db.employees.delete_one({"id": eid})
    return {"ok": True}

@api.post("/attendance")
async def create_att(a: Attendance, user=Depends(require_roles("admin", "manager"))):
    emp = await db.employees.find_one({"id": a.employee_id}, {"_id": 0})
    doc = a.model_dump()
    if emp: doc["employee_name"] = emp.get("name", "")
    await db.attendance.insert_one(doc)
    return serialize(doc)

@api.get("/attendance")
async def list_att(user=Depends(get_current_user)):
    return await list_collection(db.attendance, sort_key="date")

@api.delete("/attendance/{aid}")
async def del_att(aid: str, user=Depends(require_roles("admin", "manager"))):
    await db.attendance.delete_one({"id": aid})
    return {"ok": True}

# ---------------- P1: Marketing / Social Campaigns ----------------
@api.post("/campaigns")
async def create_camp(c: Campaign, user=Depends(get_current_user)):
    doc = c.model_dump()
    await db.campaigns.insert_one(doc)
    return serialize(doc)

@api.get("/campaigns")
async def list_camp(user=Depends(get_current_user)):
    return await list_collection(db.campaigns)

@api.put("/campaigns/{cid}")
async def upd_camp(cid: str, c: Campaign, user=Depends(get_current_user)):
    data = c.model_dump(); data.pop("id", None); data.pop("created_at", None)
    await db.campaigns.update_one({"id": cid}, {"$set": data})
    return {"ok": True}

@api.delete("/campaigns/{cid}")
async def del_camp(cid: str, user=Depends(get_current_user)):
    await db.campaigns.delete_one({"id": cid})
    return {"ok": True}

# ---------------- P1: Document Revisions (ISO 9001 etc.) ----------------
@api.post("/documents/{did}/revisions")
async def add_revision(did: str, payload: DocRevIn, user=Depends(get_current_user)):
    doc = await db.documents.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document not found")
    revs = doc.get("revisions", [])
    if not revs:
        revs.append({
            "rev_no": 0,
            "file_base64": doc.get("file_base64", ""),
            "notes": "Initial version",
            "by": doc.get("uploaded_by", ""),
            "created_at": doc.get("created_at", now_iso()),
        })
    new_rev_no = max([r.get("rev_no", 0) for r in revs]) + 1
    revs.append({
        "rev_no": new_rev_no,
        "file_base64": payload.file_base64,
        "notes": payload.notes or "",
        "by": user["name"],
        "created_at": now_iso(),
    })
    await db.documents.update_one(
        {"id": did},
        {"$set": {"revisions": revs, "file_base64": payload.file_base64, "current_revision": new_rev_no}},
    )
    return {"ok": True, "current_revision": new_rev_no}

@api.get("/documents/{did}/revisions")
async def get_revisions(did: str, user=Depends(get_current_user)):
    doc = await db.documents.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document not found")
    return {"current_revision": doc.get("current_revision", 0), "revisions": doc.get("revisions", [])}



# ---------------- Customer Portal (public) ----------------
@api.get("/portal/track")
async def portal_track(ref: str = Query(..., min_length=2)):
    ref_u = ref.strip()
    wo = await db.work_orders.find_one({"$or": [{"code": ref_u}, {"po_ref": ref_u}]}, {"_id": 0})
    if not wo:
        raise HTTPException(404, "Reference not found")
    jcs = await db.job_cards.find({"work_order_id": wo["id"]}, {"_id": 0}).to_list(200)
    qcs = await db.qc_reports.find({"work_order_id": wo["id"]}, {"_id": 0, "photos": 0}).to_list(200)
    return {
        "work_order": {k: wo.get(k) for k in ["code", "product", "qty", "status", "priority", "progress", "start_date", "due_date", "customer_name", "po_ref", "created_at"]},
        "job_cards": jcs,
        "qc_reports": qcs,
    }

# ---------------- Health ----------------
@api.get("/")
async def root():
    return {"ok": True, "service": "precision-erp"}


# ================ P2: Settings, Twilio WhatsApp, Resend, Indiamart, TradeIndia, GSTR, 2FA, Audit ================

async def get_setting(key: str) -> Dict[str, Any]:
    doc = await db.settings.find_one({"_id": key}, {"_id": 0})
    return doc or {}

async def set_setting(key: str, data: Dict[str, Any]):
    await db.settings.replace_one({"_id": key}, {"_id": key, **data}, upsert=True)

class IntegrationSettingsIn(BaseModel):
    twilio_account_sid: Optional[str] = ""
    twilio_auth_token: Optional[str] = ""
    twilio_whatsapp_from: Optional[str] = ""
    indiamart_crm_key: Optional[str] = ""
    tradeindia_webhook_secret: Optional[str] = ""
    company_name: Optional[str] = "Denplex Engineering Company"
    company_gstin: Optional[str] = ""
    company_state: Optional[str] = ""
    company_address: Optional[str] = ""
    company_tagline: Optional[str] = "Precision Engineered Solutions"

@api.get("/settings/integrations")
async def get_integrations(user=Depends(require_roles("admin"))):
    return await get_setting("integrations")

@api.put("/settings/integrations")
async def update_integrations(payload: IntegrationSettingsIn, user=Depends(require_roles("admin"))):
    data = payload.model_dump()
    await set_setting("integrations", data)
    return data

# ---------- Audit log ----------
async def write_audit(user_name: str, action: str, entity: str, entity_id: Optional[str] = None, details: Optional[Dict] = None):
    try:
        await db.audit_logs.insert_one({
            "id": new_id(),
            "user": user_name,
            "action": action,
            "entity": entity,
            "entity_id": entity_id or "",
            "details": details or {},
            "created_at": now_iso(),
        })
    except Exception as e:
        logger.exception("audit failed: %s", e)

@api.get("/audit-logs")
async def list_audit(limit: int = 200, user=Depends(require_roles("admin"))):
    rows = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 1000))
    return rows

# ---------- Twilio WhatsApp ----------
def _format_in_whatsapp(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("Empty phone number")
    if raw.lower().startswith("whatsapp:"):
        return raw
    try:
        if raw.startswith("+"):
            parsed = phonenumbers.parse(raw, None)
        else:
            parsed = phonenumbers.parse(raw, "IN")
        if not phonenumbers.is_valid_number(parsed):
            raise ValueError("Invalid phone number")
        e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException as ex:
        raise ValueError(f"Phone parse error: {ex}")
    return f"whatsapp:{e164}"

class WhatsAppSendIn(BaseModel):
    to_phone: str
    body: str
    media_url: Optional[str] = ""

@api.post("/whatsapp/send")
async def whatsapp_send(payload: WhatsAppSendIn, user=Depends(get_current_user)):
    cfg = await get_setting("integrations")
    sid = cfg.get("twilio_account_sid"); tok = cfg.get("twilio_auth_token"); frm = cfg.get("twilio_whatsapp_from")
    if not (sid and tok and frm):
        raise HTTPException(400, "Twilio not configured. Set credentials in Settings → Integrations.")
    try:
        to = _format_in_whatsapp(payload.to_phone)
    except ValueError as e:
        raise HTTPException(422, str(e))
    def _send():
        client = TwilioClient(sid, tok)
        kwargs = {"body": payload.body, "from_": frm, "to": to}
        if payload.media_url:
            kwargs["media_url"] = [payload.media_url]
        return client.messages.create(**kwargs)
    try:
        msg = await asyncio.to_thread(_send)
    except TwilioRestException as e:
        raise HTTPException(502, f"Twilio: {e.msg}")
    await write_audit(user["name"], "whatsapp_send", "message", msg.sid, {"to": to})
    return {"sid": msg.sid, "status": msg.status}

# ---------- Resend deprecated — using Gmail / Outlook OAuth instead ----------

# ---------- PDF builders ----------
def _money(n) -> str:
    try:
        return f"Rs. {float(n):,.2f}"
    except Exception:
        return f"Rs. {n}"

def _build_doc_pdf(title: str, code: str, party_label: str, party_name: str, date_s: str,
                   lines: List[Dict[str, Any]], totals: Dict[str, float], gst_breakup: Optional[Dict[str, float]] = None,
                   company: Optional[Dict[str, Any]] = None, notes: str = "") -> bytes:
    from reportlab.platypus import Image as RLImage
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=15*mm, leftMargin=15*mm, topMargin=14*mm, bottomMargin=14*mm)
    styles = getSampleStyleSheet()
    RED = colors.HexColor("#DC2626")
    BLACK = colors.HexColor("#0A0A0A")
    GREY = colors.HexColor("#475569")
    h_style = ParagraphStyle("h", parent=styles["Heading1"], fontSize=18, textColor=BLACK, spaceAfter=2)
    title_style = ParagraphStyle("ttl", parent=styles["Heading1"], fontSize=22, textColor=RED, leading=24, alignment=2, spaceAfter=0)
    sub_style = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, textColor=GREY)
    small = ParagraphStyle("sm", parent=styles["Normal"], fontSize=9, textColor=BLACK)
    company = company or {}
    flow = []
    # Header band: logo left, title right
    logo_path = str(ROOT_DIR / "logo.png")
    try:
        logo = RLImage(logo_path, width=28*mm, height=24*mm)
    except Exception:
        logo = Paragraph("<b>DENPLEX</b>", h_style)
    company_block = [
        Paragraph(f"<b><font color='#0A0A0A'>{company.get('company_name','Denplex Engineering Company').upper()}</font></b>", small),
    ]
    if company.get("company_tagline"):
        company_block.append(Paragraph(f"<font color='#DC2626'>{company['company_tagline']}</font>", sub_style))
    if company.get("company_address"):
        company_block.append(Paragraph(company["company_address"], sub_style))
    if company.get("company_gstin"):
        company_block.append(Paragraph(f"GSTIN: <b>{company['company_gstin']}</b>", sub_style))
    title_block = [Paragraph(title.upper(), title_style),
                   Paragraph(f"<b>{code}</b>", ParagraphStyle('c', parent=small, alignment=2, fontSize=11)),
                   Paragraph(f"Date: {date_s}", ParagraphStyle('d', parent=sub_style, alignment=2))]
    header_tbl = Table([[logo, company_block, title_block]], colWidths=[32*mm, 90*mm, 58*mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, RED),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    flow.append(header_tbl)
    flow.append(Spacer(1, 6*mm))
    # Party block
    flow.append(Paragraph(f"<b>{party_label}:</b>", small))
    flow.append(Paragraph(f"<font size=11><b>{party_name}</b></font>", small))
    flow.append(Spacer(1, 5*mm))
    # Lines
    header = ["#", "Description", "Qty", "Rate", "GST%", "Amount (Rs.)"]
    data = [header]
    for i, l in enumerate(lines, 1):
        qty = float(l.get("qty", 0) or 0)
        rate = float(l.get("rate", 0) or 0)
        amt = qty * rate
        data.append([str(i), l.get("description", ""), f"{qty:g}", f"{rate:,.2f}", f"{l.get('gst_rate', 0)}", f"{amt:,.2f}"])
    tbl = Table(data, colWidths=[10*mm, 78*mm, 16*mm, 22*mm, 14*mm, 30*mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLACK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
    ]))
    flow.append(tbl)
    flow.append(Spacer(1, 4*mm))
    # Totals
    tot_rows = [["Subtotal", _money(totals.get("subtotal", 0))]]
    if gst_breakup:
        if gst_breakup.get("igst"):
            tot_rows.append(["IGST", _money(gst_breakup.get("igst", 0))])
        else:
            tot_rows.append(["CGST", _money(gst_breakup.get("cgst", 0))])
            tot_rows.append(["SGST", _money(gst_breakup.get("sgst", 0))])
    else:
        tot_rows.append(["GST", _money(totals.get("gst_total", 0))])
    tot_rows.append(["Total", _money(totals.get("total", 0))])
    tot_tbl = Table(tot_rows, colWidths=[60*mm, 40*mm], hAlign="RIGHT")
    tot_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), RED),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ("LINEABOVE", (0, -1), (-1, -1), 1, BLACK),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    flow.append(tot_tbl)
    if notes:
        flow.append(Spacer(1, 6*mm))
        flow.append(Paragraph(f"<b>Notes:</b> {notes}", small))
    flow.append(Spacer(1, 14*mm))
    flow.append(Paragraph("Yours faithfully,", small))
    flow.append(Spacer(1, 12*mm))
    flow.append(Paragraph(f"<b>For {company.get('company_name','DENPLEX ENGINEERING COMPANY').upper()}</b>", small))
    flow.append(Paragraph("<font color='#475569'>Authorised Signatory &nbsp;·&nbsp; Managing Partner</font>", sub_style))
    doc.build(flow)
    return buf.getvalue()

async def _resolve_doc(coll, doc_id: str, party_id_key: str, party_name_key: str):
    doc = await coll.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc

@api.get("/invoices/{iid}/pdf")
async def invoice_pdf(iid: str, user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not inv: raise HTTPException(404, "Not found")
    company = await get_setting("integrations")
    pdf = _build_doc_pdf("Tax Invoice", inv.get("code", ""), "Bill To", inv.get("customer_name", ""), str(inv.get("date", ""))[:10],
                         inv.get("lines", []), {"subtotal": inv.get("subtotal", 0), "total": inv.get("total", 0)},
                         gst_breakup={"cgst": inv.get("cgst", 0), "sgst": inv.get("sgst", 0), "igst": inv.get("igst", 0)},
                         company=company, notes=inv.get("notes", ""))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{inv.get("code","invoice")}.pdf"'})

@api.get("/quotations/{qid}/pdf")
async def quote_pdf(qid: str, user=Depends(get_current_user)):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q: raise HTTPException(404, "Not found")
    company = await get_setting("integrations")
    pdf = _build_doc_pdf("Quotation", q.get("code", ""), "To", q.get("customer_name", ""), str(q.get("date", ""))[:10],
                         q.get("lines", []), {"subtotal": q.get("subtotal", 0), "gst_total": q.get("gst_total", 0), "total": q.get("total", 0)},
                         company=company, notes=q.get("notes", ""))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{q.get("code","quote")}.pdf"'})

@api.get("/purchase-orders/{pid}/pdf")
async def po_pdf(pid: str, user=Depends(get_current_user)):
    p = await db.purchase_orders.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    company = await get_setting("integrations")
    pdf = _build_doc_pdf("Purchase Order", p.get("code", ""), "Supplier", p.get("supplier_name", ""), str(p.get("date", ""))[:10],
                         p.get("lines", []), {"subtotal": p.get("subtotal", 0), "gst_total": p.get("gst_total", 0), "total": p.get("total", 0)},
                         company=company, notes=p.get("notes", ""))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{p.get("code","po")}.pdf"'})

# ---------- Indiamart pull leads ----------
@api.post("/integrations/indiamart/sync")
async def indiamart_sync(user=Depends(require_roles("admin", "manager", "sales"))):
    cfg = await get_setting("integrations")
    key = cfg.get("indiamart_crm_key")
    if not key:
        raise HTTPException(400, "Indiamart CRM key not set in Settings")
    # Indiamart Lead Manager: pulls last 7 days by default
    url = f"https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key={key}"
    try:
        async with httpx.AsyncClient(timeout=30) as cli:
            r = await cli.get(url)
        data = r.json()
    except Exception as e:
        raise HTTPException(502, f"Indiamart fetch failed: {e}")
    if data.get("CODE") not in (200, "200"):
        raise HTTPException(400, f"Indiamart: {data.get('MESSAGE', 'error')}")
    rows = data.get("RESPONSE", []) or []
    added = 0
    for row in rows:
        ext_id = str(row.get("UNIQUE_QUERY_ID") or row.get("QUERY_ID") or "")
        if ext_id and await db.leads.find_one({"external_id": ext_id}):
            continue
        lead = {
            "id": new_id(),
            "external_id": ext_id,
            "name": row.get("SENDER_NAME", "Unknown"),
            "company": row.get("SENDER_COMPANY", ""),
            "phone": row.get("SENDER_MOBILE", "") or row.get("SENDER_PHONE", ""),
            "email": row.get("SENDER_EMAIL", ""),
            "source": "indiamart",
            "requirement": row.get("QUERY_PRODUCT_NAME", "") or row.get("QUERY_MESSAGE", ""),
            "status": "new",
            "notes": f"City: {row.get('SENDER_CITY','')}, State: {row.get('SENDER_STATE','')}",
            "created_at": now_iso(),
        }
        await db.leads.insert_one(lead)
        added += 1
    await write_audit(user["name"], "indiamart_sync", "leads", None, {"added": added, "fetched": len(rows)})
    return {"added": added, "fetched": len(rows)}

# ---------- TradeIndia webhook ----------
class TradeIndiaLead(BaseModel):
    name: Optional[str] = ""
    company: Optional[str] = ""
    phone: Optional[str] = ""
    mobile: Optional[str] = ""
    email: Optional[str] = ""
    message: Optional[str] = ""
    product: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    external_id: Optional[str] = ""

@api.post("/integrations/tradeindia/webhook")
async def tradeindia_webhook(payload: TradeIndiaLead, token: str = Query(...)):
    cfg = await get_setting("integrations")
    expected = cfg.get("tradeindia_webhook_secret") or ""
    if not expected or token != expected:
        raise HTTPException(401, "Invalid webhook token")
    name = payload.name or "Unknown"
    phone = payload.mobile or payload.phone or ""
    if payload.external_id and await db.leads.find_one({"external_id": payload.external_id}):
        return {"ok": True, "skipped": "duplicate"}
    lead = {
        "id": new_id(),
        "external_id": payload.external_id or "",
        "name": name, "company": payload.company or "",
        "phone": phone, "email": payload.email or "",
        "source": "tradeindia",
        "requirement": payload.product or payload.message or "",
        "status": "new",
        "notes": f"City: {payload.city or ''}, State: {payload.state or ''}",
        "created_at": now_iso(),
    }
    await db.leads.insert_one(lead)
    return {"ok": True}

# ---------- GSTR-1 / GSTR-3B CSV exports ----------
def _csv_response(rows: List[List[Any]], filename: str) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    for r in rows:
        w.writerow(r)
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})

@api.get("/accounting/gstr1.csv")
async def gstr1_csv(period_from: Optional[str] = None, period_to: Optional[str] = None,
                    user=Depends(require_roles("admin", "accountant", "ca"))):
    q = {}
    if period_from or period_to:
        q["date"] = {}
        if period_from: q["date"]["$gte"] = period_from
        if period_to: q["date"]["$lte"] = period_to
    invs = await db.invoices.find(q, {"_id": 0}).to_list(5000)
    rows: List[List[Any]] = [["GSTIN/UIN of Recipient", "Receiver Name", "Invoice Number", "Invoice Date",
                              "Invoice Value", "Place of Supply", "Reverse Charge", "Applicable % of Tax Rate",
                              "Invoice Type", "E-Commerce GSTIN", "Rate", "Taxable Value", "Cess Amount"]]
    for i in invs:
        # group lines by rate
        by_rate: Dict[float, float] = {}
        for ln in i.get("lines", []):
            r = float(ln.get("gst_rate", 0))
            amt = float(ln.get("qty", 0)) * float(ln.get("rate", 0))
            by_rate[r] = by_rate.get(r, 0) + amt
        for rate, taxable in by_rate.items():
            rows.append([
                i.get("customer_gstin", ""), i.get("customer_name", ""), i.get("code", ""),
                str(i.get("date", ""))[:10], round(i.get("total", 0), 2), i.get("place_of_supply", ""),
                "N", "", "Regular", "", rate, round(taxable, 2), 0,
            ])
    return _csv_response(rows, f"GSTR1_{period_from or 'all'}_{period_to or 'all'}.csv")

@api.get("/accounting/gstr3b.csv")
async def gstr3b_csv(period_from: Optional[str] = None, period_to: Optional[str] = None,
                     user=Depends(require_roles("admin", "accountant", "ca"))):
    q = {}
    if period_from or period_to:
        q["date"] = {}
        if period_from: q["date"]["$gte"] = period_from
        if period_to: q["date"]["$lte"] = period_to
    invs = await db.invoices.find(q, {"_id": 0}).to_list(5000)
    exq = q.copy()
    expenses = await db.expenses.find(exq, {"_id": 0}).to_list(5000)
    out_tax = sum(i.get("subtotal", 0) for i in invs)
    out_cgst = sum(i.get("cgst", 0) for i in invs)
    out_sgst = sum(i.get("sgst", 0) for i in invs)
    out_igst = sum(i.get("igst", 0) for i in invs)
    in_tax = sum(e.get("amount", 0) for e in expenses)
    in_gst = sum(e.get("gst_amount", 0) for e in expenses)
    rows = [
        ["GSTR-3B Summary", f"{period_from or ''} to {period_to or ''}"],
        [],
        ["3.1 Outward Supplies (Taxable)"],
        ["Nature", "Taxable Value", "IGST", "CGST", "SGST", "Cess"],
        ["(a) Outward taxable supplies (other than zero rated, nil rated and exempted)",
         round(out_tax, 2), round(out_igst, 2), round(out_cgst, 2), round(out_sgst, 2), 0],
        [],
        ["4. Eligible ITC"],
        ["Source", "IGST", "CGST", "SGST", "Cess"],
        ["(A)(5) All other ITC", round(in_gst/2, 2) if not any(i.get("is_interstate") for i in invs) else 0,
         round(in_gst/2, 2), round(in_gst/2, 2), 0],
        [],
        ["Net GST Payable", round(out_cgst + out_sgst + out_igst - in_gst, 2)],
        ["Output taxable total", round(out_tax, 2)],
        ["Input taxable total", round(in_tax, 2)],
    ]
    return _csv_response(rows, f"GSTR3B_{period_from or 'all'}_{period_to or 'all'}.csv")

# ---------- 2FA TOTP ----------
class TotpVerifyIn(BaseModel):
    code: str

@api.post("/auth/2fa/setup")
async def totp_setup(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if u.get("totp_enabled"):
        raise HTTPException(400, "2FA already enabled")
    secret = pyotp.random_base32()
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_secret": secret, "totp_enabled": False}})
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=u["email"], issuer_name="Precision ERP")
    return {"secret": secret, "otpauth_url": uri}

@api.post("/auth/2fa/enable")
async def totp_enable(payload: TotpVerifyIn, user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    secret = u.get("totp_secret")
    if not secret:
        raise HTTPException(400, "Run setup first")
    if not pyotp.TOTP(secret).verify(payload.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_enabled": True}})
    await write_audit(user["name"], "2fa_enable", "user", user["id"])
    return {"ok": True}

@api.post("/auth/2fa/disable")
async def totp_disable(payload: TotpVerifyIn, user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not u.get("totp_enabled"): return {"ok": True}
    if not pyotp.TOTP(u["totp_secret"]).verify(payload.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_enabled": False, "totp_secret": ""}})
    await write_audit(user["name"], "2fa_disable", "user", user["id"])
    return {"ok": True}

@api.get("/auth/2fa/status")
async def totp_status(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"enabled": bool(u.get("totp_enabled"))}



# ================ Email Accounts (Gmail App Password — SMTP + IMAP) ================
# No OAuth: users connect each Gmail/Workspace mailbox by providing the email + a
# Google "App Password" (16 chars). Same flow works for Outlook/Yahoo via SMTP/IMAP.

# Per-user-encrypted secrets use a Fernet key derived from JWT_SECRET so they survive
# restarts without an extra env var. If you ever need to rotate, change JWT_SECRET and
# users will be asked to reconnect their mailboxes.
def _email_fernet() -> Fernet:
    digest = hashlib.sha256((JWT_SECRET or "denplex-erp").encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))

def _enc(plain: str) -> str:
    if plain is None:
        plain = ""
    return _email_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")

def _dec(token: str) -> str:
    if not token:
        return ""
    try:
        return _email_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""

# Common provider presets (autodetected from email domain)
EMAIL_PROVIDERS = {
    "gmail.com":      {"smtp_host": "smtp.gmail.com",      "smtp_port": 465, "imap_host": "imap.gmail.com",      "imap_port": 993, "label": "Gmail"},
    "googlemail.com": {"smtp_host": "smtp.gmail.com",      "smtp_port": 465, "imap_host": "imap.gmail.com",      "imap_port": 993, "label": "Gmail"},
    "outlook.com":    {"smtp_host": "smtp.office365.com",  "smtp_port": 587, "imap_host": "outlook.office365.com","imap_port": 993, "label": "Outlook"},
    "hotmail.com":    {"smtp_host": "smtp.office365.com",  "smtp_port": 587, "imap_host": "outlook.office365.com","imap_port": 993, "label": "Outlook"},
    "live.com":       {"smtp_host": "smtp.office365.com",  "smtp_port": 587, "imap_host": "outlook.office365.com","imap_port": 993, "label": "Outlook"},
    "yahoo.com":      {"smtp_host": "smtp.mail.yahoo.com", "smtp_port": 465, "imap_host": "imap.mail.yahoo.com",  "imap_port": 993, "label": "Yahoo"},
    "zoho.com":       {"smtp_host": "smtp.zoho.com",       "smtp_port": 465, "imap_host": "imap.zoho.com",       "imap_port": 993, "label": "Zoho"},
}
DEFAULT_PROVIDER = {"smtp_host": "smtp.gmail.com", "smtp_port": 465, "imap_host": "imap.gmail.com", "imap_port": 993, "label": "Gmail"}

def _autodetect(email_addr: str) -> Dict[str, Any]:
    dom = (email_addr or "").lower().split("@")[-1]
    return EMAIL_PROVIDERS.get(dom, DEFAULT_PROVIDER)

def _app_pw_hint(label: str) -> str:
    """Provider-specific hint shown in 4xx/5xx auth errors."""
    if label == "Outlook":
        return "Open https://account.microsoft.com/security → Advanced security → App passwords and paste the generated password here (2-Step Verification must be ON)."
    if label == "Yahoo":
        return "Open Yahoo → Account Info → Account security → Generate app password and paste it here."
    if label == "Zoho":
        return "Open Zoho Mail → Settings → Mail Accounts → App Specific Passwords and paste it here."
    return "Make sure 2-Step Verification is ON in your Google Account, then create an App Password at https://myaccount.google.com/apppasswords and paste it here (spaces ok, we strip them)."

class EmailAccountIn(BaseModel):
    email: EmailStr
    app_password: str
    label: Optional[str] = ""
    is_default: bool = False
    # Optional manual overrides (rarely needed; autodetected from domain)
    smtp_host: Optional[str] = ""
    smtp_port: Optional[int] = 0
    imap_host: Optional[str] = ""
    imap_port: Optional[int] = 0

class EmailSendIn(BaseModel):
    to: List[EmailStr]
    subject: str
    html: str
    cc: Optional[List[EmailStr]] = None
    bcc: Optional[List[EmailStr]] = None
    attachment_base64: Optional[str] = ""
    attachment_filename: Optional[str] = ""
    attachment_mime: Optional[str] = "application/pdf"
    account_id: Optional[str] = ""  # if blank uses default account

def _account_public(a: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": a.get("id"),
        "email": a.get("email"),
        "label": a.get("label") or _autodetect(a.get("email", "")).get("label"),
        "smtp_host": a.get("smtp_host"),
        "smtp_port": a.get("smtp_port"),
        "imap_host": a.get("imap_host"),
        "imap_port": a.get("imap_port"),
        "is_default": bool(a.get("is_default")),
        "last_test_at": a.get("last_test_at", ""),
        "last_test_ok": bool(a.get("last_test_ok", False)),
        "last_test_error": a.get("last_test_error", ""),
        "created_at": a.get("created_at", ""),
    }

def _smtp_test(smtp_host: str, smtp_port: int, email_addr: str, password: str) -> None:
    """Raise on any failure. Uses SSL on 465, STARTTLS otherwise."""
    ctx = ssl.create_default_context()
    if int(smtp_port) == 465:
        with smtplib.SMTP_SSL(smtp_host, int(smtp_port), context=ctx, timeout=20) as s:
            s.login(email_addr, password)
    else:
        with smtplib.SMTP(smtp_host, int(smtp_port), timeout=20) as s:
            s.ehlo()
            s.starttls(context=ctx)
            s.ehlo()
            s.login(email_addr, password)

def _imap_open(imap_host: str, imap_port: int, email_addr: str, password: str) -> imaplib.IMAP4_SSL:
    m = imaplib.IMAP4_SSL(imap_host, int(imap_port))
    m.login(email_addr, password)
    return m

async def _record_test(user_id: str, acct_id: str, ok: bool, err: str = ""):
    await db.email_accounts.update_one(
        {"id": acct_id, "user_id": user_id},
        {"$set": {"last_test_at": now_iso(), "last_test_ok": bool(ok), "last_test_error": (err or "")[:300]}},
    )

@api.post("/email/accounts")
async def add_email_account(payload: EmailAccountIn, user=Depends(get_current_user)):
    preset = _autodetect(payload.email)
    smtp_host = (payload.smtp_host or preset["smtp_host"]).strip()
    smtp_port = int(payload.smtp_port or preset["smtp_port"]) 
    imap_host = (payload.imap_host or preset["imap_host"]).strip()
    imap_port = int(payload.imap_port or preset["imap_port"]) 
    pw = (payload.app_password or "").strip().replace(" ", "")  # Google shows spaces in groups of 4
    if not pw:
        raise HTTPException(400, "App password required")
    label = preset["label"]
    # Test SMTP login synchronously before persisting (fail fast with a helpful message)
    try:
        await asyncio.to_thread(_smtp_test, smtp_host, smtp_port, str(payload.email), pw)
    except smtplib.SMTPAuthenticationError as e:
        raise HTTPException(400, f"SMTP login failed ({e.smtp_code}). {_app_pw_hint(label)}")
    except Exception as e:
        raise HTTPException(400, f"SMTP test failed: {e}")
    # Quick IMAP test (non-fatal — if IMAP is blocked we'll still allow sending)
    imap_err = ""
    try:
        m = await asyncio.to_thread(_imap_open, imap_host, imap_port, str(payload.email), pw)
        await asyncio.to_thread(m.logout)
    except Exception as e:
        imap_err = f"IMAP (inbox read) failed: {e}"
    # If this is the user's first account or marked default, clear others
    if payload.is_default:
        await db.email_accounts.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    has_any = await db.email_accounts.find_one({"user_id": user["id"]})
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "email": str(payload.email).lower(),
        "label": payload.label or _autodetect(str(payload.email))["label"],
        "encrypted_password": _enc(pw),
        "smtp_host": smtp_host, "smtp_port": smtp_port,
        "imap_host": imap_host, "imap_port": imap_port,
        "is_default": bool(payload.is_default) or (has_any is None),
        "created_at": now_iso(),
        "last_test_at": now_iso(),
        "last_test_ok": True,
        "last_test_error": imap_err,
    }
    await db.email_accounts.insert_one(doc)
    await write_audit(user["name"], "email_account_added", "email_account", doc["id"], {"email": doc["email"]})
    return {**_account_public(doc), "imap_warning": (imap_err or None)}

@api.get("/email/accounts")
async def list_email_accounts(user=Depends(get_current_user)):
    rows = await db.email_accounts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(50)
    return [_account_public(r) for r in rows]

@api.delete("/email/accounts/{acct_id}")
async def delete_email_account(acct_id: str, user=Depends(get_current_user)):
    a = await db.email_accounts.find_one({"id": acct_id, "user_id": user["id"]})
    if not a:
        raise HTTPException(404, "Not found")
    await db.email_accounts.delete_one({"id": acct_id, "user_id": user["id"]})
    # If we removed the default, promote the next one
    if a.get("is_default"):
        nxt = await db.email_accounts.find_one({"user_id": user["id"]})
        if nxt:
            await db.email_accounts.update_one({"id": nxt["id"]}, {"$set": {"is_default": True}})
    await write_audit(user["name"], "email_account_removed", "email_account", acct_id, {"email": a.get("email")})
    return {"ok": True}

@api.post("/email/accounts/{acct_id}/default")
async def set_default_email(acct_id: str, user=Depends(get_current_user)):
    a = await db.email_accounts.find_one({"id": acct_id, "user_id": user["id"]})
    if not a:
        raise HTTPException(404, "Not found")
    await db.email_accounts.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.email_accounts.update_one({"id": acct_id, "user_id": user["id"]}, {"$set": {"is_default": True}})
    return {"ok": True}

@api.post("/email/accounts/{acct_id}/test")
async def test_email_account(acct_id: str, user=Depends(get_current_user)):
    a = await db.email_accounts.find_one({"id": acct_id, "user_id": user["id"]})
    if not a:
        raise HTTPException(404, "Not found")
    pw = _dec(a.get("encrypted_password", ""))
    err = ""
    ok = True
    try:
        await asyncio.to_thread(_smtp_test, a["smtp_host"], a["smtp_port"], a["email"], pw)
    except Exception as e:
        ok = False
        err = f"SMTP: {e}"
    if ok:
        try:
            m = await asyncio.to_thread(_imap_open, a["imap_host"], a["imap_port"], a["email"], pw)
            await asyncio.to_thread(m.logout)
        except Exception as e:
            err = f"IMAP: {e}"  # don't flip ok; send still works
    await _record_test(user["id"], acct_id, ok, err)
    return {"ok": ok, "error": err}

async def _pick_account(user_id: str, account_id: str = "") -> Dict[str, Any]:
    if account_id:
        a = await db.email_accounts.find_one({"id": account_id, "user_id": user_id})
        if not a:
            raise HTTPException(404, "Email account not found")
        return a
    a = await db.email_accounts.find_one({"user_id": user_id, "is_default": True})
    if a:
        return a
    a = await db.email_accounts.find_one({"user_id": user_id})
    if not a:
        raise HTTPException(400, "No email account connected. Open Settings → Email Accounts and add one.")
    return a

@api.post("/email/send")
async def email_send(payload: EmailSendIn, user=Depends(get_current_user)):
    a = await _pick_account(user["id"], payload.account_id or "")
    pw = _dec(a.get("encrypted_password", ""))
    msg = EmailMessage()
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
    from_name = u.get("name") or "Denplex ERP"
    msg["From"] = f'{from_name} <{a["email"]}>'
    msg["To"] = ", ".join([str(e) for e in payload.to])
    if payload.cc: msg["Cc"] = ", ".join([str(e) for e in payload.cc])
    if payload.bcc: msg["Bcc"] = ", ".join([str(e) for e in payload.bcc])
    msg["Subject"] = payload.subject
    msg.set_content("This email contains HTML content. Please use an HTML-capable client.")
    msg.add_alternative(payload.html, subtype="html")
    if payload.attachment_base64 and payload.attachment_filename:
        b64 = payload.attachment_base64
        if b64.startswith("data:") and "," in b64:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64)
        maintype, _, subtype = (payload.attachment_mime or "application/octet-stream").partition("/")
        msg.add_attachment(raw, maintype=maintype, subtype=subtype, filename=payload.attachment_filename)
    rcpts: List[str] = [str(e) for e in payload.to] + [str(e) for e in (payload.cc or [])] + [str(e) for e in (payload.bcc or [])]
    def _do_send():
        ctx = ssl.create_default_context()
        if int(a["smtp_port"]) == 465:
            with smtplib.SMTP_SSL(a["smtp_host"], int(a["smtp_port"]), context=ctx, timeout=30) as s:
                s.login(a["email"], pw)
                s.send_message(msg, from_addr=a["email"], to_addrs=rcpts)
        else:
            with smtplib.SMTP(a["smtp_host"], int(a["smtp_port"]), timeout=30) as s:
                s.ehlo(); s.starttls(context=ctx); s.ehlo()
                s.login(a["email"], pw)
                s.send_message(msg, from_addr=a["email"], to_addrs=rcpts)
    try:
        await asyncio.to_thread(_do_send)
    except smtplib.SMTPAuthenticationError as e:
        hint = _app_pw_hint(_autodetect(a["email"])["label"])
        raise HTTPException(502, f"Login rejected by mail server ({e.smtp_code}). Your App Password may have expired. {hint}")
    except Exception as e:
        raise HTTPException(502, f"Email send failed: {e}")
    await write_audit(user["name"], "email_send", "email", None, {"from": a["email"], "to": payload.to, "subject": payload.subject})
    return {"ok": True, "from": a["email"]}

def _decode_header_str(value: str) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    out = []
    for txt, enc in parts:
        if isinstance(txt, bytes):
            try:
                out.append(txt.decode(enc or "utf-8", errors="replace"))
            except Exception:
                out.append(txt.decode("utf-8", errors="replace"))
        else:
            out.append(txt)
    return "".join(out)

def _fetch_inbox(host: str, port: int, email_addr: str, password: str, max_n: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    m = imaplib.IMAP4_SSL(host, int(port))
    try:
        m.login(email_addr, password)
        m.select("INBOX", readonly=True)
        typ, data = m.search(None, "ALL")
        if typ != "OK" or not data or not data[0]:
            return out
        ids = data[0].split()
        recent = ids[-int(max_n):][::-1]
        for mid in recent:
            typ, msg_data = m.fetch(mid, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[TEXT]<0.500>)")
            if typ != "OK" or not msg_data:
                continue
            headers = ""
            snippet = ""
            for part in msg_data:
                if isinstance(part, tuple) and len(part) >= 2:
                    chunk = part[1].decode("utf-8", errors="replace") if isinstance(part[1], (bytes, bytearray)) else str(part[1])
                    if "FROM" in (part[0].decode(errors="replace") if isinstance(part[0], (bytes, bytearray)) else str(part[0])).upper():
                        headers = chunk
                    else:
                        snippet = chunk
            msg = emaillib.message_from_string(headers or "")
            frm_raw = _decode_header_str(msg.get("From", ""))
            subj = _decode_header_str(msg.get("Subject", ""))
            date_s = msg.get("Date", "")
            try:
                date_iso = parsedate_to_datetime(date_s).isoformat() if date_s else ""
            except Exception:
                date_iso = ""
            name, em_addr = parseaddr(frm_raw)
            # Clean snippet: strip HTML tags, collapse whitespace
            snippet_text = re.sub(r"<[^>]+>", " ", snippet)
            snippet_text = re.sub(r"&nbsp;|&zwnj;|&amp;|&lt;|&gt;|&quot;", " ", snippet_text)
            snippet_clean = re.sub(r"\s+", " ", snippet_text).strip()[:240]
            out.append({
                "uid": mid.decode("utf-8", errors="replace") if isinstance(mid, (bytes, bytearray)) else str(mid),
                "from_name": name or (em_addr.split("@")[0] if em_addr else ""),
                "from_email": em_addr or "",
                "subject": subj,
                "date": date_iso,
                "snippet": snippet_clean,
            })
    finally:
        try:
            m.close()
        except Exception:
            pass
        try:
            m.logout()
        except Exception:
            pass
    return out

@api.get("/email/accounts/{acct_id}/inbox")
async def email_inbox(acct_id: str, max: int = 25, user=Depends(get_current_user)):
    a = await db.email_accounts.find_one({"id": acct_id, "user_id": user["id"]})
    if not a:
        raise HTTPException(404, "Not found")
    pw = _dec(a.get("encrypted_password", ""))
    try:
        msgs = await asyncio.to_thread(_fetch_inbox, a["imap_host"], a["imap_port"], a["email"], pw, max)
    except Exception as e:
        raise HTTPException(502, f"Inbox fetch failed: {e}")
    return {"account": a["email"], "messages": msgs}

async def _sync_one_account(user_id: str, a: Dict[str, Any], max_n: int = 25) -> Dict[str, int]:
    pw = _dec(a.get("encrypted_password", ""))
    try:
        msgs = await asyncio.to_thread(_fetch_inbox, a["imap_host"], a["imap_port"], a["email"], pw, max_n)
    except Exception:
        return {"added": 0, "scanned": 0}
    added = 0
    for m in msgs:
        em_addr = (m.get("from_email") or "").lower()
        if not em_addr:
            continue
        if "noreply" in em_addr or "no-reply" in em_addr or "mailer-daemon" in em_addr:
            continue
        ext = f"{a['email']}::{m.get('uid')}"
        if await db.leads.find_one({"external_id": ext}):
            continue
        await db.leads.insert_one({
            "id": new_id(),
            "external_id": ext,
            "name": m.get("from_name") or em_addr.split("@")[0],
            "company": "",
            "phone": "",
            "email": em_addr,
            "source": "email",
            "requirement": m.get("subject", "") or m.get("snippet", "")[:160],
            "status": "new",
            "notes": (m.get("snippet", "") or "")[:500],
            "created_at": now_iso(),
        })
        added += 1
    return {"added": added, "scanned": len(msgs)}

@api.post("/email/accounts/{acct_id}/sync-leads")
async def email_sync_one(acct_id: str, max: int = 25, user=Depends(get_current_user)):
    a = await db.email_accounts.find_one({"id": acct_id, "user_id": user["id"]})
    if not a:
        raise HTTPException(404, "Not found")
    res = await _sync_one_account(user["id"], a, max)
    await write_audit(user["name"], "email_sync_leads", "leads", None, {"account": a["email"], **res})
    return {"account": a["email"], **res}

@api.post("/email/sync-leads")
async def email_sync_all(max: int = 25, user=Depends(get_current_user)):
    accts = await db.email_accounts.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    if not accts:
        raise HTTPException(400, "No email accounts connected.")
    total_added = 0; total_scanned = 0; per = []
    for a in accts:
        res = await _sync_one_account(user["id"], a, max)
        per.append({"account": a["email"], **res})
        total_added += res["added"]; total_scanned += res["scanned"]
    await write_audit(user["name"], "email_sync_leads_all", "leads", None, {"added": total_added, "scanned": total_scanned})
    return {"added": total_added, "scanned": total_scanned, "per_account": per}



# ---------------- Seed ----------------
@app.on_event("startup")
async def startup():
    # Owner admin (Denplex)
    if not await db.users.find_one({"email": "admin@denplex.co"}):
        await db.users.insert_one({
            "id": new_id(),
            "name": "Denplex Owner",
            "email": "admin@denplex.co",
            "role": "admin",
            "password": hash_password("Shivganesh4$"),
            "created_at": now_iso(),
        })
        logger.info("Seeded owner admin@denplex.co")
    # Demo admin (trial sandbox login)
    if not await db.users.find_one({"email": "admin@erp.com"}):
        await db.users.insert_one({
            "id": new_id(),
            "name": "Demo Admin",
            "email": "admin@erp.com",
            "role": "admin",
            "password": hash_password("Admin@123"),
            "created_at": now_iso(),
        })
        logger.info("Seeded demo admin@erp.com / Admin@123")

# ---------------- Trial Signup ----------------
@api.post("/trial/request")
async def submit_trial_request(payload: TrialRequestIn):
    if await db.trial_requests.find_one({"email": payload.email.lower(), "status": {"$in": ["pending", "approved"]}}):
        raise HTTPException(400, "A trial request for this email already exists. Please contact admin@denplex.co.")
    doc = {
        "id": new_id(),
        "name": payload.name,
        "company": payload.company,
        "phone": payload.phone,
        "email": payload.email.lower(),
        "gstin": payload.gstin or "",
        "business_type": payload.business_type or "",
        "purpose": payload.purpose or "",
        "status": "pending",
        "created_at": now_iso(),
        "reviewed_at": "",
        "reviewed_by": "",
        "review_note": "",
        "approved_user_id": "",
        "trial_expires_at": "",
        "temp_password": "",
    }
    await db.trial_requests.insert_one(doc)
    return {"ok": True, "id": doc["id"], "message": "Thank you! Your trial request has been received. We'll verify and email you within 24 hours."}

@api.get("/trial/requests")
async def list_trial_requests(status: Optional[str] = None, user=Depends(require_roles("admin"))):
    q = {"status": status} if status else {}
    rows = await db.trial_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows

@api.post("/trial/requests/{rid}/approve")
async def approve_trial(rid: str, payload: TrialApproveIn, user=Depends(require_roles("admin"))):
    req = await db.trial_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Request already {req['status']}")
    if await db.users.find_one({"email": req["email"]}):
        raise HTTPException(400, "A user with this email already exists")
    temp_pw = "trial-" + secrets.token_urlsafe(6)
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    new_user_id = new_id()
    await db.users.insert_one({
        "id": new_user_id,
        "name": req["name"],
        "email": req["email"],
        "role": "trial",
        "password": hash_password(temp_pw),
        "trial_expires_at": expires,
        "created_at": now_iso(),
        "company": req.get("company", ""),
        "phone": req.get("phone", ""),
    })
    await db.trial_requests.update_one(
        {"id": rid},
        {"$set": {
            "status": "approved",
            "reviewed_at": now_iso(),
            "reviewed_by": user["name"],
            "review_note": payload.note or "",
            "approved_user_id": new_user_id,
            "trial_expires_at": expires,
            "temp_password": temp_pw,
        }},
    )
    await write_audit(user["name"], "trial_approved", "trial_request", rid, {"email": req["email"]})
    return {"ok": True, "email": req["email"], "temp_password": temp_pw, "trial_expires_at": expires}

@api.post("/trial/requests/{rid}/reject")
async def reject_trial(rid: str, payload: TrialApproveIn, user=Depends(require_roles("admin"))):
    req = await db.trial_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Request already {req['status']}")
    await db.trial_requests.update_one(
        {"id": rid},
        {"$set": {"status": "rejected", "reviewed_at": now_iso(), "reviewed_by": user["name"], "review_note": payload.note or ""}},
    )
    await write_audit(user["name"], "trial_rejected", "trial_request", rid)
    return {"ok": True}

@api.delete("/trial/requests/{rid}")
async def del_trial_request(rid: str, user=Depends(require_roles("admin"))):
    await db.trial_requests.delete_one({"id": rid})
    return {"ok": True}

# ---------------- App config ----------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
