from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, Request, Response, UploadFile, File, Form
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
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------- PDF font registration ----------------
# Helvetica (reportlab default) lacks proper rupee glyph + many UTF-8 symbols.
# Try DejaVuSans (present on most Ubuntu/Debian + Railway), then a bundled
# fallback in backend/fonts/, then give up and use Helvetica.
_PDF_FONT_REGULAR = "Helvetica"
_PDF_FONT_BOLD = "Helvetica-Bold"

def _ensure_font_files_on_disk():
    """Best-effort: if backend/fonts/DejaVu*.ttf is missing, fetch from CDN.
    Runs once at startup; idempotent. Failures are non-fatal (we fall back to Helvetica)."""
    try:
        import urllib.request
        target_dir = Path(__file__).parent / "fonts"
        target_dir.mkdir(parents=True, exist_ok=True)
        urls = {
            "DejaVuSans.ttf": "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf",
            "DejaVuSans-Bold.ttf": "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
        }
        for name, url in urls.items():
            tgt = target_dir / name
            if tgt.exists() and tgt.stat().st_size > 100_000:
                continue
            try:
                urllib.request.urlretrieve(url, str(tgt))
            except Exception:
                pass
    except Exception:
        pass

def _try_register_pdf_fonts():
    global _PDF_FONT_REGULAR, _PDF_FONT_BOLD
    candidates = [
        # System DejaVu (rare on Railway slim images but try anyway)
        ("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "DejaVuSans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        # Bundled / auto-downloaded into backend/fonts/
        ("DejaVuSans", str(Path(__file__).parent / "fonts" / "DejaVuSans.ttf"),
         "DejaVuSans-Bold", str(Path(__file__).parent / "fonts" / "DejaVuSans-Bold.ttf")),
        ("NotoSans", str(Path(__file__).parent / "fonts" / "NotoSans-Regular.ttf"),
         "NotoSans-Bold", str(Path(__file__).parent / "fonts" / "NotoSans-Bold.ttf")),
    ]
    import os as _os
    for name, path, name_b, path_b in candidates:
        try:
            if _os.path.exists(path) and _os.path.exists(path_b):
                pdfmetrics.registerFont(TTFont(name, path))
                pdfmetrics.registerFont(TTFont(name_b, path_b))
                _PDF_FONT_REGULAR = name
                _PDF_FONT_BOLD = name_b
                return name
        except Exception:
            continue
    return _PDF_FONT_REGULAR

# Order matters: try to download then register
_ensure_font_files_on_disk()
_try_register_pdf_fonts()

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

# Audit middleware: log all successful writes (POST/PUT/PATCH/DELETE) on /api/* by authenticated users
@app.middleware("http")
async def audit_writes_mw(request: Request, call_next):
    response = await call_next(request)
    try:
        path = request.url.path
        method = request.method
        if (method in ("POST", "PUT", "PATCH", "DELETE")
                and path.startswith("/api/")
                and not path.startswith("/api/auth/")
                and not path.startswith("/api/audit")
                and response.status_code < 400):
            auth = request.headers.get("authorization", "")
            user_name = "anonymous"
            if auth.lower().startswith("bearer "):
                try:
                    token = auth.split(" ", 1)[1]
                    p = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                    u = await db.users.find_one({"id": p["sub"]}, {"_id": 0, "name": 1, "email": 1})
                    if u:
                        user_name = u.get("name") or u.get("email") or "unknown"
                except Exception:
                    pass
            fwd = request.headers.get("x-forwarded-for", "")
            ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")
            await db.audit_logs.insert_one({
                "id": str(uuid.uuid4()),
                "user": user_name,
                "action": method.lower(),
                "entity": "api",
                "entity_id": path,
                "details": {"status": response.status_code},
                "ip": ip,
                "user_agent": (request.headers.get("user-agent", "") or "")[:300],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        logger.warning("audit writes mw failed: %s", e)
    return response

ROLES = ["admin", "manager", "production", "qc", "accountant", "ca", "sales", "design", "employee", "trial"]

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
    role: Literal["admin", "manager", "production", "qc", "accountant", "ca", "sales", "design", "employee", "trial"] = "employee"
    unit: Optional[str] = "Unit 1"

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
    item_code: Optional[str] = ""        # SKU / part number, shown as "Item Code" col
    hsn: Optional[str] = ""
    qty: float
    unit: Optional[str] = "Nos"          # Mtr, Kg, Nos, etc.
    rate: float
    discount_pct: float = 0.0
    discount_amount: float = 0.0
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
    # Optional Ship To override (when shipping address ≠ billing address)
    ship_to_name: Optional[str] = ""
    ship_to_address: Optional[str] = ""
    ship_to_gstin: Optional[str] = ""
    # Optional Bill From / Ship From overrides (defaults derived from company settings)
    bill_from_name: Optional[str] = ""
    bill_from_address: Optional[str] = ""
    ship_from_name: Optional[str] = ""        # e.g. "Unit - 1"
    ship_from_address: Optional[str] = ""
    # Vyapar-style PO meta
    po_number: Optional[str] = ""
    po_date: Optional[str] = ""
    purchaser_name: Optional[str] = ""
    payment_mode: Optional[str] = ""
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
async def register(payload: RegisterIn, request: Request, current=Depends(get_current_user)):
    if current["role"] != "admin":
        raise HTTPException(403, "Only admin can register users")
    if await db.users.find_one({"email": payload.email.lower()}):
        raise HTTPException(400, "Email already exists")
    user = {
        "id": new_id(),
        "name": payload.name,
        "email": payload.email.lower(),
        "role": payload.role,
        "unit": (payload.unit or "Unit 1"),
        "password": hash_password(payload.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    await write_audit(
        current.get("name", "admin"),
        "user_created",
        "user",
        user["id"],
        {"email": user["email"], "role": user["role"], "unit": user["unit"]},
        request=request,
    )
    user.pop("_id", None); user.pop("password", None)
    return user

@api.post("/auth/login")
async def login(payload: LoginIn, request: Request):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password"]):
        await write_audit(payload.email.lower(), "login_failed", "auth", "", {"reason": "invalid_credentials"}, request=request)
        raise HTTPException(401, "Invalid credentials")
    # Trial expiry check at login
    exp = user.get("trial_expires_at")
    if exp:
        try:
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                await write_audit(user.get("name") or payload.email.lower(), "login_failed", "auth", user["id"], {"reason": "trial_expired"}, request=request)
                raise HTTPException(403, "Trial expired. Please contact admin@denplex.co to extend your access.")
        except HTTPException:
            raise
        except Exception:
            pass
    if user.get("totp_enabled"):
        if not payload.totp_code:
            raise HTTPException(401, "TOTP code required", headers={"X-2FA-Required": "1"})
        if not pyotp.TOTP(user.get("totp_secret", "")).verify(payload.totp_code, valid_window=1):
            await write_audit(user.get("name") or payload.email.lower(), "login_failed", "auth", user["id"], {"reason": "invalid_totp"}, request=request)
            raise HTTPException(401, "Invalid TOTP code")
    token = create_token(user["id"], user["role"])
    await write_audit(user.get("name") or payload.email.lower(), "login_success", "auth", user["id"], {"role": user["role"]}, request=request)
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
async def change_password(payload: ChangePwIn, request: Request, user=Depends(get_current_user)):
    if len(payload.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    u = await db.users.find_one({"id": user["id"]})
    if not u or not verify_password(payload.current_password, u["password"]):
        raise HTTPException(401, "Current password is incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": hash_password(payload.new_password)}})
    await write_audit(user["name"], "password_changed", "user", user["id"], request=request)
    return {"ok": True}

@api.get("/users")
async def list_users(user=Depends(require_roles("admin"))):
    return await db.users.find({}, {"_id": 0, "password": 0, "totp_secret": 0}).to_list(500)

# ---------------- Generic CRUD helpers ----------------
def serialize(d: Dict[str, Any]) -> Dict[str, Any]:
    d.pop("_id", None)
    return d

async def list_collection(coll, query: Dict = None, sort_key: str = "created_at", limit: int = 5000):
    cursor = coll.find(query or {}, {"_id": 0}).sort(sort_key, -1)
    return await cursor.to_list(limit)

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
    raise HTTPException(503, "AI bill scanning is temporarily disabled. Please enter bill details manually for now. This feature will be re-enabled soon.")

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
    # Projection-limited fetches to keep dashboard fast even with thousands of records
    items = await db.items.find(
        {}, {"_id": 0, "id": 1, "sku": 1, "name": 1, "qty_on_hand": 1, "reorder_level": 1, "uom": 1}
    ).to_list(5000)
    low_stock = [i for i in items if i.get("qty_on_hand", 0) <= i.get("reorder_level", 0)]
    open_wo = await db.work_orders.count_documents({"status": {"$in": ["planned", "in_progress"]}})
    qc_pending = await db.work_orders.count_documents({"status": "qc"})
    leads_open = await db.leads.count_documents({"status": {"$in": ["new", "contacted", "qualified"]}})
    customers = await db.customers.count_documents({})
    # Aggregate revenue at the DB layer instead of pulling 2000 docs into Python
    rev_pipeline = [
        {"$match": {"status": {"$in": ["paid", "sent"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]
    rev_cursor = db.invoices.aggregate(rev_pipeline)
    rev_doc = await rev_cursor.to_list(1)
    revenue = float(rev_doc[0]["total"]) if rev_doc else 0.0
    items_count = await db.items.count_documents({})
    repeat_customers = await db.customers.count_documents({"customer_type": "repeat"})
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
        "items_count": items_count,
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
    # Multi-unit support: list of {name, address} dicts. Renders one block per unit
    # in the PDF header. If empty, falls back to company_address.
    company_units: Optional[List[Dict[str, str]]] = []
    company_tagline: Optional[str] = "Precision Engineered Solutions"
    company_phone: Optional[str] = ""
    company_email: Optional[str] = ""
    company_udyam: Optional[str] = ""  # UDYAM / MSME registration shown on letterhead
    # Bank / UPI block (printed on every invoice as per Vyapar layout)
    bank_name: Optional[str] = ""
    bank_account_no: Optional[str] = ""
    bank_ifsc: Optional[str] = ""
    bank_branch: Optional[str] = ""
    upi_id: Optional[str] = ""  # e.g. denplex@axisbank — used to auto-generate QR
    # Signatory image (base64 PNG/JPG, optional)
    signatory_image_b64: Optional[str] = ""
    signatory_label: Optional[str] = "Authorised Signatory"
    # Terms & default sale description
    invoice_terms: Optional[str] = "Thanks for doing business with us!"
    invoice_description: Optional[str] = ""

@api.get("/settings/integrations")
async def get_integrations(user=Depends(require_roles("admin"))):
    return await get_setting("integrations")

@api.put("/settings/integrations")
async def update_integrations(payload: IntegrationSettingsIn, user=Depends(require_roles("admin"))):
    data = payload.model_dump()
    await set_setting("integrations", data)
    return data

# ---------- Invoice Template (Vyapar-style toggles) ----------
class InvoiceTemplateIn(BaseModel):
    """Per-section visibility flags for the printed PDF (Vyapar's 'Print > Regular Printer' style)."""
    show_company_logo: bool = True
    show_company_address: bool = True
    show_company_gstin: bool = True
    show_company_email: bool = True
    show_company_phone: bool = True
    show_company_udyam: bool = True
    show_ship_to: bool = True
    show_bill_from: bool = False             # Off by default; auto-on when invoice has explicit bill_from
    show_ship_from: bool = False             # Off by default; auto-on when invoice has explicit ship_from
    show_due_date: bool = True
    show_place_of_supply: bool = True
    show_hsn_column: bool = True
    show_item_code_column: bool = True       # Item Code column (like Vyapar)
    show_po_meta: bool = True                # PO Date / PO No / Purchaser Name in meta box
    show_discount_column: bool = True
    show_tax_summary: bool = True            # HSN-wise CGST/SGST/IGST breakup
    show_totals_sidebar: bool = True         # Sub Total / Discount / Tax / TCS / Total
    show_amount_in_words: bool = True
    show_payment_mode: bool = True
    show_description: bool = True
    show_terms: bool = True
    show_bank_details: bool = True
    show_upi_qr: bool = True
    show_signatory_image: bool = True
    print_original_duplicate: bool = True
    paper_size: Literal["A4", "A5"] = "A4"
    orientation: Literal["portrait", "landscape"] = "portrait"
    amount_in_words_locale: Literal["en_IN", "en"] = "en_IN"
    # Style preset: "standard" = full Vyapar layout, "compact" = single-page minimal,
    # "modern" = clean serif with accent lines and more whitespace.
    template_style: Literal["standard", "compact", "modern"] = "standard"

@api.get("/settings/invoice-template")
async def get_invoice_template(doc_type: Optional[str] = None, user=Depends(get_current_user)):
    """Return template settings. If `doc_type` is supplied, returns the merged
    {default + doc_type override} flags. Otherwise returns the full map keyed by doc_type."""
    s = await get_setting("invoice_template") or {}
    defaults = InvoiceTemplateIn().model_dump()
    base = {**defaults, **(s.get("default") or {})}
    if doc_type:
        override = (s.get(doc_type) or {})
        return {**base, **override}
    # Return full map for the UI
    KNOWN = ["default", "invoice", "quotation", "purchase_order", "sale_order",
            "delivery_challan", "job_work_out", "credit_note", "vendor_bill"]
    out: Dict[str, Any] = {}
    for k in KNOWN:
        out[k] = {**base, **((s.get(k) or {}))}
    return out

@api.put("/settings/invoice-template")
async def update_invoice_template(payload: Dict[str, Any], user=Depends(require_roles("admin"))):
    """Accepts either a flat `InvoiceTemplateIn` (treated as `default`) or a map
    {doc_type: {flags...}}. Storing only the overrides keeps each doc_type small."""
    # Validate by passing through model where possible
    allowed = set(InvoiceTemplateIn().model_dump().keys())
    s = await get_setting("invoice_template") or {}
    if any(k in payload for k in allowed):
        # Flat payload → save as `default`
        clean = {k: v for k, v in payload.items() if k in allowed}
        s["default"] = clean
    else:
        # Map payload → merge each doc_type
        for dt, flags in payload.items():
            if not isinstance(flags, dict): continue
            s[dt] = {k: v for k, v in flags.items() if k in allowed}
    await set_setting("invoice_template", s)
    return s

# ---------- Audit log ----------
def get_client_ip(request: Optional[Request]) -> str:
    if not request:
        return ""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""

async def write_audit(user_name: str, action: str, entity: str, entity_id: Optional[str] = None, details: Optional[Dict] = None, request: Optional[Request] = None):
    try:
        ip = get_client_ip(request)
        ua = (request.headers.get("user-agent", "") if request else "")[:300]
        await db.audit_logs.insert_one({
            "id": new_id(),
            "user": user_name,
            "action": action,
            "entity": entity,
            "entity_id": entity_id or "",
            "details": details or {},
            "ip": ip,
            "user_agent": ua,
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

# ---------- PDF builders (Vyapar-style with Denplex Red/Black branding) ----------
def _money(n) -> str:
    try:
        return f"Rs. {float(n):,.2f}"
    except Exception:
        return f"Rs. {n}"

def _amount_in_words(n: float, locale: str = "en_IN") -> str:
    try:
        from num2words import num2words
        rupees = int(n)
        paise = round((float(n) - rupees) * 100)
        words_r = num2words(rupees, lang="en_IN" if locale == "en_IN" else "en").title()
        out = f"{words_r} Rupees"
        if paise:
            out += f" and {num2words(paise, lang='en').title()} Paise"
        return out + " only"
    except Exception:
        return ""

def _upi_qr_png(upi_id: str, payee_name: str, amount: float = 0.0, note: str = "") -> Optional[bytes]:
    """Generate UPI QR (BHIM/PhonePe/GPay scannable) as PNG bytes."""
    if not upi_id:
        return None
    try:
        import qrcode
        from urllib.parse import urlencode, quote
        params = {"pa": upi_id, "pn": payee_name or "Denplex", "cu": "INR"}
        if amount and amount > 0:
            params["am"] = f"{amount:.2f}"
        if note:
            params["tn"] = note[:50]
        # Use quote_via to keep & encoded correctly
        upi_url = "upi://pay?" + urlencode(params, quote_via=quote)
        qr = qrcode.QRCode(box_size=3, border=1)
        qr.add_data(upi_url); qr.make(fit=True)
        img = qr.make_image(fill_color="#0A0A0A", back_color="#FFFFFF")
        out = io.BytesIO(); img.save(out, format="PNG")
        return out.getvalue()
    except Exception:
        return None

def _hsn_tax_summary(lines: List[Dict[str, Any]], is_interstate: bool) -> List[Dict[str, Any]]:
    """Aggregate per-HSN tax breakup like Vyapar's Tax Summary block."""
    bucket: Dict[str, Dict[str, float]] = {}
    for l in lines or []:
        hsn = str(l.get("hsn") or "")
        qty = float(l.get("qty", 0) or 0)
        rate = float(l.get("rate", 0) or 0)
        gst_rate = float(l.get("gst_rate", 0) or 0)
        taxable = qty * rate
        b = bucket.setdefault(hsn, {"taxable": 0.0, "cgst_amt": 0.0, "sgst_amt": 0.0, "igst_amt": 0.0, "cgst_rate": 0.0, "sgst_rate": 0.0, "igst_rate": 0.0})
        b["taxable"] += taxable
        if is_interstate:
            b["igst_rate"] = gst_rate
            b["igst_amt"] += taxable * gst_rate / 100
        else:
            b["cgst_rate"] = gst_rate / 2
            b["sgst_rate"] = gst_rate / 2
            b["cgst_amt"] += taxable * gst_rate / 200
            b["sgst_amt"] += taxable * gst_rate / 200
    rows = []
    for hsn, v in bucket.items():
        rows.append({"hsn": hsn, **v, "total_tax": v["cgst_amt"] + v["sgst_amt"] + v["igst_amt"]})
    return rows

def _build_doc_pdf(title: str, code: str, party_label: str, party_name: str, date_s: str,
                   lines: List[Dict[str, Any]], totals: Dict[str, float], gst_breakup: Optional[Dict[str, float]] = None,
                   company: Optional[Dict[str, Any]] = None, notes: str = "",
                   tpl: Optional[Dict[str, Any]] = None,
                   party_extra: Optional[Dict[str, Any]] = None,
                   ship_to: Optional[Dict[str, Any]] = None,
                   doc_meta: Optional[Dict[str, Any]] = None,
                   copy_label: str = "ORIGINAL FOR RECIPIENT",
                   bill_from: Optional[Dict[str, Any]] = None,
                   ship_from: Optional[Dict[str, Any]] = None) -> bytes:
    """Vyapar-style invoice/quotation/PO PDF — Denplex Red+Black branded.
    `tpl` overrides which sections are visible (defaults to all-on).
    `party_extra` carries gstin/phone/state/address for the Bill-To party.
    `ship_to` is an optional shipping address dict.
    `doc_meta` may contain {due_date, place_of_supply, payment_mode, time}.
    """
    from reportlab.platypus import Image as RLImage
    tpl = tpl or {}
    # Compact preset turns off heavy blocks by default; user toggles still win.
    _COMPACT_OFF_BY_DEFAULT = {"show_tax_summary", "show_bank_details", "show_upi_qr",
                                "show_signatory_image", "show_description", "show_terms"}
    _style_default = (tpl.get("template_style") or "standard").lower()
    def show(k: str, default: bool = True) -> bool:
        v = tpl.get(k)
        if v is None and _style_default == "compact" and k in _COMPACT_OFF_BY_DEFAULT:
            return False
        return default if v is None else bool(v)
    party_extra = party_extra or {}
    doc_meta = doc_meta or {}
    company = company or {}
    is_interstate = bool((doc_meta or {}).get("is_interstate")) or bool(gst_breakup and gst_breakup.get("igst"))

    RED = colors.HexColor("#DC2626")
    BLACK = colors.HexColor("#0A0A0A")
    GREY = colors.HexColor("#475569")
    LIGHTGREY = colors.HexColor("#F1F5F9")
    BORDER = colors.HexColor("#CBD5E1")

    # ---- Style preset (standard / compact / modern) ----
    style_preset = (tpl.get("template_style") or "standard").lower()
    if style_preset == "compact":
        _margin = 6*mm; _body = 7.5; _title_sz = 16; _company_sz = 12; _border_w = 0.4
        _accent = colors.HexColor("#475569")  # slate grey accent
    elif style_preset == "modern":
        _margin = 14*mm; _body = 9.0; _title_sz = 22; _company_sz = 14; _border_w = 0.0  # no full borders
        _accent = colors.HexColor("#1E293B")  # near-black accent
    else:  # standard (Vyapar)
        _margin = 10*mm; _body = 8.5; _title_sz = 18; _company_sz = 13; _border_w = 0.75
        _accent = RED

    # Pick fonts: use registered TTF (e.g. DejaVuSans) for proper ₹ rendering
    _FONT = _PDF_FONT_REGULAR
    _FONT_B = _PDF_FONT_BOLD
    _TITLE_FONT = _FONT_B if style_preset != "modern" else (_FONT_B)  # serif if available later

    buf = io.BytesIO()
    page_size = A4
    doc = SimpleDocTemplate(buf, pagesize=page_size,
                            rightMargin=_margin, leftMargin=_margin,
                            topMargin=max(_margin - 2*mm, 6*mm),
                            bottomMargin=_margin)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ttl", parent=styles["Heading1"], fontName=_TITLE_FONT,
                                 fontSize=_title_sz, textColor=BLACK, leading=_title_sz+2,
                                 alignment=(0 if style_preset == "modern" else 1), spaceAfter=0)
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"], fontName=_FONT_B,
                              fontSize=14, textColor=BLACK, leading=16, spaceAfter=0)
    small = ParagraphStyle("sm", parent=styles["Normal"], fontName=_FONT,
                           fontSize=_body, textColor=BLACK, leading=_body+2.5)
    smallb = ParagraphStyle("smb", parent=small, fontName=_FONT_B)
    tiny = ParagraphStyle("ti", parent=styles["Normal"], fontName=_FONT,
                          fontSize=max(_body-1, 6.5), textColor=GREY, leading=max(_body, 8.5))
    box_label = ParagraphStyle("bl", parent=smallb, fontSize=_body+0.5, textColor=BLACK)
    copy_lbl = ParagraphStyle("cl", parent=small, fontSize=_body-0.5, textColor=GREY, alignment=2)
    flow = []

    # Modern style: render an accent line under title later
    _is_modern = (style_preset == "modern")
    _is_compact = (style_preset == "compact")

    # ---------- Top right "Original for Recipient" ----------
    if show("print_original_duplicate") and copy_label:
        flow.append(Paragraph(copy_label.upper(), copy_lbl))

    # ---------- Title ----------
    flow.append(Paragraph(f"<b>{title}</b>", title_style))
    if _is_modern:
        # Accent line beneath the title
        from reportlab.platypus import HRFlowable
        flow.append(HRFlowable(width="100%", thickness=1.2, color=_accent, spaceBefore=2, spaceAfter=4))
    else:
        flow.append(Spacer(1, 3*mm))

    # ---------- Company header card ----------
    logo_cell = ""
    if show("show_company_logo"):
        logo_path = str(ROOT_DIR / "logo.png")
        try:
            logo_cell = RLImage(logo_path, width=22*mm, height=22*mm)
        except Exception:
            logo_cell = Paragraph("<b>DENPLEX</b>", h2_style)
    company_lines = [Paragraph(f"<font size=13><b>{company.get('company_name','Denplex Engineering Company')}</b></font>", smallb)]
    if show("show_company_udyam") and company.get("company_udyam"):
        company_lines.append(Paragraph(f"<font color='#475569'>UDYAM: <b>{company['company_udyam']}</b></font>", tiny))
    # Multi-unit address takes priority; fall back to single company_address
    _units = company.get("company_units") or []
    if show("show_company_address"):
        if _units and isinstance(_units, list):
            for u in _units:
                if not isinstance(u, dict): continue
                u_name = (u.get("name") or "").strip()
                u_addr = (u.get("address") or "").strip()
                if not (u_name or u_addr):
                    continue
                if u_name:
                    company_lines.append(Paragraph(f"<b>{u_name}:</b> {u_addr}", tiny))
                else:
                    company_lines.append(Paragraph(u_addr, tiny))
        elif company.get("company_address"):
            company_lines.append(Paragraph(company["company_address"], tiny))
    # Phone + Email + State row
    contact_bits = []
    if show("show_company_phone") and company.get("company_phone"):
        contact_bits.append(f"<b>Phone:</b> {company['company_phone']}")
    if show("show_company_gstin") and company.get("company_gstin"):
        contact_bits.append(f"<b>GSTIN:</b> {company['company_gstin']}")
    if contact_bits:
        company_lines.append(Paragraph(" &nbsp;&nbsp; ".join(contact_bits), tiny))
    contact2 = []
    if show("show_company_email") and company.get("company_email"):
        contact2.append(f"<b>Email:</b> {company['company_email']}")
    if company.get("company_state"):
        contact2.append(f"<b>State:</b> {company['company_state']}")
    if contact2:
        company_lines.append(Paragraph(" &nbsp;&nbsp; ".join(contact2), tiny))

    header_tbl = Table([[logo_cell, company_lines]], colWidths=[28*mm, 162*mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), _border_w, BORDER) if _border_w > 0 else
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    flow.append(header_tbl)

    # ---------- Bill To / Invoice Details (two-column box) ----------
    bill_lines = [Paragraph(f"<b>{party_label}:</b>", box_label),
                  Paragraph(f"<font size=10><b>{party_name}</b></font>", smallb)]
    if party_extra.get("address"): bill_lines.append(Paragraph(party_extra["address"], tiny))
    if party_extra.get("phone"):   bill_lines.append(Paragraph(f"Contact No.: <b>{party_extra['phone']}</b>", tiny))
    if party_extra.get("gstin"):   bill_lines.append(Paragraph(f"GSTIN: <b>{party_extra['gstin']}</b>", tiny))
    if party_extra.get("state"):   bill_lines.append(Paragraph(f"State: <b>{party_extra['state']}</b>", tiny))

    meta_lines = [Paragraph(f"<b>{title.split()[0]} Details:</b>", box_label),
                  Paragraph(f"{title.split()[0]} No.: <b>{code}</b>", smallb),
                  Paragraph(f"Date: <b>{date_s}</b>", smallb)]
    if show("show_due_date") and doc_meta.get("due_date"):
        meta_lines.append(Paragraph(f"Due Date: <b>{doc_meta['due_date']}</b>", smallb))
    if show("show_place_of_supply") and doc_meta.get("place_of_supply"):
        meta_lines.append(Paragraph(f"Place of Supply: <b>{doc_meta['place_of_supply']}</b>", smallb))
    # PO meta (Vyapar-style): PO Date, PO No, Purchaser Name
    if show("show_po_meta"):
        if doc_meta.get("po_date"):
            meta_lines.append(Paragraph(f"PO Date: <b>{doc_meta['po_date']}</b>", smallb))
        if doc_meta.get("po_number") or doc_meta.get("po_no"):
            meta_lines.append(Paragraph(f"PO No: <b>{doc_meta.get('po_number') or doc_meta.get('po_no')}</b>", smallb))
        if doc_meta.get("purchaser_name"):
            meta_lines.append(Paragraph(f"Purchaser Name: <b>{doc_meta['purchaser_name']}</b>", smallb))

    bd_tbl = Table([[bill_lines, meta_lines]], colWidths=[95*mm, 95*mm])
    bd_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    flow.append(bd_tbl)

    # ---------- Ship To ----------
    if show("show_ship_to") and ship_to and (ship_to.get("name") or ship_to.get("address")):
        ship_block = [Paragraph("<b>Ship To:</b>", box_label),
                      Paragraph(ship_to.get("name", ""), smallb)]
        if ship_to.get("address"):
            ship_block.append(Paragraph(ship_to["address"], tiny))
        ship_tbl = Table([[ship_block]], colWidths=[190*mm])
        ship_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        flow.append(ship_tbl)

    # ---------- Bill From / Ship From (purchase docs or multi-unit shipments) ----------
    def _addr_block(label, payload):
        block = [Paragraph(f"<b>{label}:</b>", box_label),
                 Paragraph(payload.get("name", ""), smallb)]
        if payload.get("address"):
            block.append(Paragraph(payload["address"], tiny))
        tbl = Table([[block]], colWidths=[190*mm])
        tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return tbl
    if show("show_bill_from", False) and bill_from and (bill_from.get("name") or bill_from.get("address")):
        flow.append(_addr_block("Bill From", bill_from))
    if show("show_ship_from", False) and ship_from and (ship_from.get("name") or ship_from.get("address")):
        flow.append(_addr_block("Ship From", ship_from))

    # ---------- Line items ----------
    show_hsn = show("show_hsn_column")
    show_code = show("show_item_code_column")
    show_disc = show("show_discount_column")
    cols = ["#", "Item name"]
    widths = [7*mm, 50*mm]
    if show_code:
        cols.append("Item Code"); widths.append(20*mm)
    if show_hsn:
        cols.append("HSN/SAC"); widths.append(18*mm)
    cols += ["Qty", "Price/unit"]; widths += [14*mm, 20*mm]
    if show_disc:
        cols.append("Discount"); widths.append(20*mm)
    cols += ["GST", "Amount"]; widths += [22*mm, 20*mm]

    data = [cols]
    subtotal = 0.0; total_discount = 0.0; total_gst = 0.0; total_amount = 0.0
    for i, l in enumerate(lines or [], 1):
        qty = float(l.get("qty", 0) or 0)
        rate = float(l.get("rate", 0) or 0)
        disc_amt = float(l.get("discount_amount") or 0)
        disc_pct = float(l.get("discount_pct") or 0)
        # If percent provided, derive amount; else, percent for display
        gross = qty * rate
        if disc_amt == 0 and disc_pct:
            disc_amt = gross * disc_pct / 100
        net = max(gross - disc_amt, 0)
        gst_rate = float(l.get("gst_rate", 0) or 0)
        gst_amt = net * gst_rate / 100
        amt = net + gst_amt
        subtotal += gross
        total_discount += disc_amt
        total_gst += gst_amt
        total_amount += amt
        row = [str(i), Paragraph(l.get("description", ""), small)]
        if show_code:
            row.append(str(l.get("item_code") or l.get("code") or ""))
        if show_hsn:
            row.append(str(l.get("hsn") or ""))
        row += [f"{qty:g}", f"₹ {rate:,.2f}"]
        if show_disc:
            row.append(f"₹ {disc_amt:,.2f} ({disc_pct:g}%)" if disc_amt else "—")
        row += [f"₹ {gst_amt:,.2f} ({gst_rate:g}%)" if gst_amt else "—", f"₹ {amt:,.2f}"]
        data.append(row)
    # Total row
    tot_row = ["", Paragraph("<b>TOTAL</b>", smallb)]
    if show_code: tot_row.append("")
    if show_hsn: tot_row.append("")
    tot_row += [f"{sum(float(l.get('qty',0) or 0) for l in (lines or [])):g}", ""]
    if show_disc: tot_row.append(f"₹ {total_discount:,.2f}")
    tot_row += [f"₹ {total_gst:,.2f}", f"₹ {total_amount:,.2f}"]
    data.append(tot_row)

    tbl = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), LIGHTGREY),
        ("FONTNAME", (0, 0), (-1, 0), _PDF_FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2 if show_hsn else 2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        # Total row
        ("BACKGROUND", (0, -1), (-1, -1), LIGHTGREY),
        ("FONTNAME", (0, -1), (-1, -1), _PDF_FONT_BOLD),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, BLACK),
    ]
    tbl.setStyle(TableStyle(style))
    flow.append(tbl)

    # ---------- Tax Summary + Totals sidebar ----------
    bottom_left_blocks = []
    if show("show_tax_summary") and (lines or []):
        rows = _hsn_tax_summary(lines or [], is_interstate)
        if rows:
            if is_interstate:
                hdr = ["HSN/SAC", "Taxable Amount", "IGST Rate", "IGST Amount", "Total Tax Amount"]
                t_data = [hdr]
                ct = 0; gt_taxable = 0; gt_total_tax = 0
                for r in rows:
                    gt_taxable += r["taxable"]; ct += r["igst_amt"]; gt_total_tax += r["total_tax"]
                    t_data.append([r["hsn"] or "—", f"₹ {r['taxable']:,.2f}", f"{r['igst_rate']:g}%", f"₹ {r['igst_amt']:,.2f}", f"₹ {r['total_tax']:,.2f}"])
                t_data.append(["Total", f"₹ {gt_taxable:,.2f}", "", f"₹ {ct:,.2f}", f"₹ {gt_total_tax:,.2f}"])
                widths_ts = [22*mm, 24*mm, 14*mm, 22*mm, 24*mm]
            else:
                hdr = ["HSN/SAC", "Taxable Amount", "CGST Rate", "CGST Amount", "SGST Rate", "SGST Amount", "Total Tax Amount"]
                t_data = [hdr]
                gt_taxable=0; gt_c=0; gt_s=0; gt_total_tax=0
                for r in rows:
                    gt_taxable += r["taxable"]; gt_c += r["cgst_amt"]; gt_s += r["sgst_amt"]; gt_total_tax += r["total_tax"]
                    t_data.append([r["hsn"] or "—", f"₹ {r['taxable']:,.2f}", f"{r['cgst_rate']:g}%", f"₹ {r['cgst_amt']:,.2f}", f"{r['sgst_rate']:g}%", f"₹ {r['sgst_amt']:,.2f}", f"₹ {r['total_tax']:,.2f}"])
                t_data.append(["Total", f"₹ {gt_taxable:,.2f}", "", f"₹ {gt_c:,.2f}", "", f"₹ {gt_s:,.2f}", f"₹ {gt_total_tax:,.2f}"])
                widths_ts = [18*mm, 20*mm, 12*mm, 18*mm, 12*mm, 18*mm, 20*mm]
            ts = Table(t_data, colWidths=widths_ts)
            ts.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), LIGHTGREY),
                ("FONTNAME", (0,0), (-1,0), _PDF_FONT_BOLD),
                ("FONTSIZE", (0,0), (-1,-1), 7.5),
                ("ALIGN", (1,0), (-1,-1), "RIGHT"),
                ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                ("GRID", (0,0), (-1,-1), 0.4, BORDER),
                ("BACKGROUND", (0,-1), (-1,-1), LIGHTGREY),
                ("FONTNAME", (0,-1), (-1,-1), _PDF_FONT_BOLD),
                ("TOPPADDING", (0,0), (-1,-1), 3),
                ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ]))
            bottom_left_blocks.append(Paragraph("<b>Tax Summary:</b>", smallb))
            bottom_left_blocks.append(ts)

    # Totals sidebar
    sidebar = []
    if show("show_totals_sidebar"):
        sd = []
        sd.append(["Sub Total", f"₹ {subtotal:,.2f}"])
        if total_discount:
            sd.append(["Discount", f"₹ {total_discount:,.2f}"])
        if is_interstate:
            sd.append(["IGST", f"₹ {(gst_breakup or {}).get('igst', total_gst):,.2f}"])
        else:
            cg = (gst_breakup or {}).get("cgst", total_gst/2)
            sg = (gst_breakup or {}).get("sgst", total_gst/2)
            sd.append(["CGST", f"₹ {cg:,.2f}"])
            sd.append(["SGST", f"₹ {sg:,.2f}"])
        sd.append(["Total", f"₹ {totals.get('total', total_amount):,.2f}"])
        side = Table(sd, colWidths=[28*mm, 30*mm])
        side.setStyle(TableStyle([
            ("FONTSIZE", (0,0), (-1,-1), 9),
            ("ALIGN", (1,0), (1,-1), "RIGHT"),
            ("GRID", (0,0), (-1,-1), 0.4, BORDER),
            ("FONTNAME", (0,-1), (-1,-1), _PDF_FONT_BOLD),
            ("BACKGROUND", (0,-1), (-1,-1), RED),
            ("TEXTCOLOR", (0,-1), (-1,-1), colors.white),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ]))
        sidebar.append(side)
    # Amount in words (under totals)
    if show("show_amount_in_words"):
        words = _amount_in_words(float(totals.get("total", total_amount) or 0), tpl.get("amount_in_words_locale", "en_IN"))
        if words:
            sidebar.append(Spacer(1, 2*mm))
            sidebar.append(Paragraph("<b>Invoice Amount In Words:</b>", tiny))
            sidebar.append(Paragraph(words, smallb))

    # Lay out [tax summary | sidebar]
    if bottom_left_blocks or sidebar:
        left_cell = bottom_left_blocks or [Spacer(1, 1)]
        right_cell = sidebar or [Spacer(1, 1)]
        ts_tbl = Table([[left_cell, right_cell]], colWidths=[125*mm, 65*mm])
        ts_tbl.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
            ("TOPPADDING", (0,0), (-1,-1), 4),
        ]))
        flow.append(ts_tbl)

    # ---------- Payment Mode ----------
    if show("show_payment_mode") and doc_meta.get("payment_mode"):
        flow.append(Spacer(1, 2*mm))
        pm = Table([[Paragraph("<b>Payment Mode:</b>", smallb), Paragraph(doc_meta["payment_mode"], small)]],
                   colWidths=[35*mm, 155*mm])
        pm.setStyle(TableStyle([("BOX",(0,0),(-1,-1),0.5,BORDER),("INNERGRID",(0,0),(-1,-1),0.4,BORDER),
                                ("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5),
                                ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]))
        flow.append(pm)

    # ---------- Description / Terms ----------
    if show("show_description") or show("show_terms"):
        desc_text = company.get("invoice_description", "") if show("show_description") else ""
        terms_text = company.get("invoice_terms", "") if show("show_terms") else ""
        if notes:
            desc_text = (desc_text + "\n" + notes).strip() if desc_text else notes
        if desc_text or terms_text:
            cells_l = [Paragraph("<b>Description:</b>", smallb), Paragraph(desc_text or "—", small)]
            cells_r = [Paragraph("<b>Terms &amp; Conditions:</b>", smallb), Paragraph(terms_text or "—", small)]
            dt_tbl = Table([[cells_l, cells_r]], colWidths=[95*mm, 95*mm])
            dt_tbl.setStyle(TableStyle([
                ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("BOX", (0,0), (-1,-1), 0.5, BORDER),
                ("LINEAFTER", (0,0), (0,-1), 0.4, BORDER),
                ("LEFTPADDING", (0,0), (-1,-1), 6),
                ("RIGHTPADDING", (0,0), (-1,-1), 6),
                ("TOPPADDING", (0,0), (-1,-1), 5),
                ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ]))
            flow.append(Spacer(1, 2*mm))
            flow.append(dt_tbl)

    # ---------- Bank details + QR + Signatory ----------
    has_bank = show("show_bank_details") and any(company.get(k) for k in ("bank_name","bank_account_no","bank_ifsc","upi_id"))
    has_sig = show("show_signatory_image")
    if has_bank or has_sig:
        # Bank cell with optional QR
        bank_block = [Paragraph("<b>Bank Details:</b>", smallb)]
        # QR
        qr_img = None
        if show("show_upi_qr") and company.get("upi_id"):
            qr_png = _upi_qr_png(company.get("upi_id", ""), company.get("company_name", "Denplex"),
                                 amount=float(totals.get("total", 0) or 0), note=code)
            if qr_png:
                qr_img = RLImage(io.BytesIO(qr_png), width=22*mm, height=22*mm)
        bank_lines = []
        if company.get("bank_name"): bank_lines.append(Paragraph(f"Bank Name: <b>{company['bank_name']}</b>", small))
        if company.get("bank_account_no"): bank_lines.append(Paragraph(f"Bank Account No.: <b>{company['bank_account_no']}</b>", small))
        if company.get("bank_ifsc"): bank_lines.append(Paragraph(f"Bank IFSC code: <b>{company['bank_ifsc']}</b>", small))
        if company.get("bank_branch"): bank_lines.append(Paragraph(f"Branch: <b>{company['bank_branch']}</b>", small))
        if company.get("upi_id"): bank_lines.append(Paragraph(f"UPI: <b>{company['upi_id']}</b>", small))
        if qr_img:
            left_bank = Table([[qr_img, bank_lines]], colWidths=[24*mm, 71*mm])
            left_bank.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),
                                           ("RIGHTPADDING",(0,0),(-1,-1),4),("TOPPADDING",(0,0),(-1,-1),0),
                                           ("BOTTOMPADDING",(0,0),(-1,-1),0)]))
            bank_block.append(left_bank)
        else:
            bank_block.extend(bank_lines)

        # Signatory cell
        sig_block = [Paragraph(f"<b>For: {company.get('company_name','Denplex Engineering Company')}</b>", smallb)]
        sig_b64 = company.get("signatory_image_b64") or ""
        if has_sig and sig_b64:
            try:
                b = sig_b64.split(",",1)[1] if sig_b64.startswith("data:") else sig_b64
                raw = base64.b64decode(b)
                sig_img = RLImage(io.BytesIO(raw), width=40*mm, height=18*mm, kind="proportional")
                sig_block.append(Spacer(1, 1*mm))
                sig_block.append(sig_img)
            except Exception:
                sig_block.append(Spacer(1, 12*mm))
        else:
            sig_block.append(Spacer(1, 12*mm))
        sig_block.append(Paragraph(f"<font color='#475569'>{company.get('signatory_label','Authorised Signatory')}</font>", tiny))

        bs_tbl = Table([[bank_block, sig_block]], colWidths=[95*mm, 95*mm])
        bs_tbl.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("BOX", (0,0), (-1,-1), 0.5, BORDER),
            ("LINEAFTER", (0,0), (0,-1), 0.4, BORDER),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("ALIGN", (1,0), (1,-1), "CENTER"),
        ]))
        flow.append(Spacer(1, 2*mm))
        flow.append(bs_tbl)

    doc.build(flow)
    return buf.getvalue()

async def _resolve_doc(coll, doc_id: str, party_id_key: str, party_name_key: str):
    doc = await coll.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc

async def _tpl_for(doc_type: str) -> Dict[str, Any]:
    s = await get_setting("invoice_template") or {}
    defaults = InvoiceTemplateIn().model_dump()
    base = {**defaults, **(s.get("default") or {})}
    return {**base, **((s.get(doc_type) or {}))}

@api.get("/invoices/{iid}/pdf")
async def invoice_pdf(iid: str, copy: Optional[str] = "ORIGINAL FOR RECIPIENT", user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not inv: raise HTTPException(404, "Not found")
    company = await get_setting("integrations")
    tpl = await _tpl_for("invoice")
    party_extra = {}
    if inv.get("customer_id"):
        c = await db.customers.find_one({"id": inv["customer_id"]}, {"_id": 0}) or {}
        party_extra = {"address": c.get("address",""), "phone": c.get("phone",""), "gstin": c.get("gstin",""), "state": c.get("state","")}
    # Build optional Ship To: explicit on invoice wins; else fall back to customer address
    ship_to = None
    if inv.get("ship_to_address") or inv.get("ship_to_name"):
        ship_to = {"name": inv.get("ship_to_name") or inv.get("customer_name", ""),
                   "address": inv.get("ship_to_address", ""),
                   "gstin": inv.get("ship_to_gstin", "")}
    elif party_extra.get("address"):
        ship_to = {"name": inv.get("customer_name", ""), "address": party_extra.get("address", ""),
                   "gstin": party_extra.get("gstin", "")}
    bill_from = None
    if inv.get("bill_from_name") or inv.get("bill_from_address"):
        bill_from = {"name": inv.get("bill_from_name", ""), "address": inv.get("bill_from_address", "")}
    ship_from = None
    if inv.get("ship_from_name") or inv.get("ship_from_address"):
        ship_from = {"name": inv.get("ship_from_name", ""), "address": inv.get("ship_from_address", "")}
    # Auto-enable bill_from / ship_from blocks when invoice has those fields
    if bill_from: tpl = {**tpl, "show_bill_from": True}
    if ship_from: tpl = {**tpl, "show_ship_from": True}
    doc_meta = {
        "due_date": str(inv.get("due_date",""))[:10],
        "place_of_supply": inv.get("place_of_supply",""),
        "payment_mode": inv.get("payment_mode",""),
        "po_number": inv.get("po_number",""),
        "po_date": inv.get("po_date",""),
        "purchaser_name": inv.get("purchaser_name",""),
        "is_interstate": bool(inv.get("is_interstate")),
    }
    pdf = _build_doc_pdf("Tax Invoice", inv.get("code", ""), "Bill To", inv.get("customer_name", ""), str(inv.get("date", ""))[:10],
                         inv.get("lines", []),
                         {"subtotal": inv.get("subtotal", 0), "total": inv.get("total", 0), "gst_total": inv.get("cgst",0)+inv.get("sgst",0)+inv.get("igst",0)},
                         gst_breakup={"cgst": inv.get("cgst", 0), "sgst": inv.get("sgst", 0), "igst": inv.get("igst", 0)},
                         company=company, notes=inv.get("notes", ""), tpl=tpl,
                         party_extra=party_extra, ship_to=ship_to, doc_meta=doc_meta,
                         copy_label=copy or "ORIGINAL FOR RECIPIENT",
                         bill_from=bill_from, ship_from=ship_from)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{inv.get("code","invoice")}.pdf"'})

@api.get("/quotations/{qid}/pdf")
async def quote_pdf(qid: str, user=Depends(get_current_user)):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q: raise HTTPException(404, "Not found")
    company = await get_setting("integrations")
    tpl = await _tpl_for("quotation")
    party_extra = {}
    if q.get("customer_id"):
        c = await db.customers.find_one({"id": q["customer_id"]}, {"_id": 0}) or {}
        party_extra = {"address": c.get("address",""), "phone": c.get("phone",""), "gstin": c.get("gstin",""), "state": c.get("state","")}
    pdf = _build_doc_pdf("Quotation", q.get("code", ""), "To", q.get("customer_name", ""), str(q.get("date", ""))[:10],
                         q.get("lines", []), {"subtotal": q.get("subtotal", 0), "gst_total": q.get("gst_total", 0), "total": q.get("total", 0)},
                         company=company, notes=q.get("notes", ""), tpl=tpl, party_extra=party_extra,
                         copy_label="")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{q.get("code","quote")}.pdf"'})

@api.get("/purchase-orders/{pid}/pdf")
async def po_pdf(pid: str, user=Depends(get_current_user)):
    p = await db.purchase_orders.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    company = await get_setting("integrations")
    tpl = await _tpl_for("purchase_order")
    party_extra = {}
    if p.get("supplier_id"):
        c = await db.suppliers.find_one({"id": p["supplier_id"]}, {"_id": 0}) or {}
        party_extra = {"address": c.get("address",""), "phone": c.get("phone",""), "gstin": c.get("gstin",""), "state": c.get("state","")}
    pdf = _build_doc_pdf("Purchase Order", p.get("code", ""), "Supplier", p.get("supplier_name", ""), str(p.get("date", ""))[:10],
                         p.get("lines", []), {"subtotal": p.get("subtotal", 0), "gst_total": p.get("gst_total", 0), "total": p.get("total", 0)},
                         company=company, notes=p.get("notes", ""), tpl=tpl, party_extra=party_extra,
                         copy_label="")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{p.get("code","po")}.pdf"'})

# ---------- New document types (imported from Vyapar) ----------
def _party_extra_from(c: Dict[str, Any]) -> Dict[str, Any]:
    return {"address": (c or {}).get("address",""), "phone": (c or {}).get("phone",""),
            "gstin": (c or {}).get("gstin",""), "state": (c or {}).get("state","")}

async def _generic_doc_pdf(coll, did: str, title: str, party_label: str, party_field: str, party_coll, doc_type: str, copy_label: str = ""):
    d = await coll.find_one({"id": did}, {"_id": 0})
    if not d: raise HTTPException(404, "Not found")
    company = await get_setting("integrations")
    tpl = await _tpl_for(doc_type)
    party_id_key = f"{party_field}_id"
    party_name_key = f"{party_field}_name"
    party_extra = _party_extra_from(await party_coll.find_one({"id": d.get(party_id_key)}, {"_id": 0}) if d.get(party_id_key) else {})
    totals = {"subtotal": d.get("subtotal", 0), "gst_total": d.get("gst_total", 0), "total": d.get("total", 0)}
    pdf = _build_doc_pdf(title, d.get("code",""), party_label, d.get(party_name_key,""), str(d.get("date",""))[:10],
                         d.get("lines", []), totals,
                         gst_breakup={"cgst": d.get("cgst",0), "sgst": d.get("sgst",0), "igst": d.get("igst",0)},
                         company=company, notes=d.get("notes",""), tpl=tpl,
                         party_extra=party_extra,
                         doc_meta={"due_date": str(d.get("due_date",""))[:10],
                                   "place_of_supply": d.get("place_of_supply",""),
                                   "payment_mode": d.get("payment_mode",""),
                                   "is_interstate": bool(d.get("is_interstate"))},
                         copy_label=copy_label)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{d.get("code",doc_type)}.pdf"'})

@api.get("/vendor-bills")
async def list_vendor_bills(user=Depends(get_current_user)):
    return await list_collection(db.vendor_bills, sort_key="date")

@api.get("/vendor-bills/{did}/pdf")
async def vendor_bill_pdf(did: str, user=Depends(get_current_user)):
    return await _generic_doc_pdf(db.vendor_bills, did, "Purchase Bill", "Supplier", "supplier", db.suppliers, "vendor_bill")

@api.get("/sale-orders")
async def list_sale_orders(user=Depends(get_current_user)):
    return await list_collection(db.sale_orders, sort_key="date")

@api.get("/sale-orders/{did}/pdf")
async def sale_order_pdf(did: str, user=Depends(get_current_user)):
    return await _generic_doc_pdf(db.sale_orders, did, "Sale Order", "Customer", "customer", db.customers, "sale_order")

@api.get("/delivery-challans")
async def list_delivery_challans(user=Depends(get_current_user)):
    return await list_collection(db.delivery_challans, sort_key="date")

@api.get("/delivery-challans/{did}/pdf")
async def delivery_challan_pdf(did: str, user=Depends(get_current_user)):
    return await _generic_doc_pdf(db.delivery_challans, did, "Delivery Challan", "Ship To", "customer", db.customers, "delivery_challan")

@api.get("/job-work-out")
async def list_job_work_out(user=Depends(get_current_user)):
    return await list_collection(db.job_work_out, sort_key="date")

@api.get("/job-work-out/{did}/pdf")
async def job_work_out_pdf(did: str, user=Depends(get_current_user)):
    return await _generic_doc_pdf(db.job_work_out, did, "Job Work Out Challan", "Job Worker", "customer", db.customers, "job_work_out")

@api.get("/credit-notes")
async def list_credit_notes(user=Depends(get_current_user)):
    return await list_collection(db.credit_notes, sort_key="date")

@api.get("/credit-notes/{did}/pdf")
async def credit_note_pdf(did: str, user=Depends(get_current_user)):
    return await _generic_doc_pdf(db.credit_notes, did, "Credit Note", "Bill To", "customer", db.customers, "credit_note")

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
async def totp_enable(payload: TotpVerifyIn, request: Request, user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    secret = u.get("totp_secret")
    if not secret:
        raise HTTPException(400, "Run setup first")
    if not pyotp.TOTP(secret).verify(payload.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_enabled": True}})
    await write_audit(user["name"], "2fa_enable", "user", user["id"], request=request)
    return {"ok": True}

@api.post("/auth/2fa/disable")
async def totp_disable(payload: TotpVerifyIn, request: Request, user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not u.get("totp_enabled"): return {"ok": True}
    if not pyotp.TOTP(u["totp_secret"]).verify(payload.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_enabled": False, "totp_secret": ""}})
    await write_audit(user["name"], "2fa_disable", "user", user["id"], request=request)
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




# ================ Vyapar Import (.vyb / .xlsx / .csv) ================
# Vyapar has no public API; we accept (a) Excel/CSV exports from Vyapar's
# Reports menu (most reliable), or (b) a raw `.vyb` backup which we attempt
# to identify (SQLite / ZIP / encrypted). Encrypted backups fall back to
# instructions on how to do the Excel export.

VYAPAR_UPLOAD_DIR = Path("/tmp/vyapar_uploads")
VYAPAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def _vyb_inspect(path: Path) -> Dict[str, Any]:
    """Identify what's inside an uploaded file."""
    import sqlite3, zipfile
    out: Dict[str, Any] = {"kind": "unknown", "tables": [], "counts": {}, "notes": ""}
    with open(path, "rb") as f:
        head = f.read(64)
    if head.startswith(b"SQLite format 3"):
        out["kind"] = "sqlite"
        try:
            con = sqlite3.connect(str(path)); cur = con.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            tables = [r[0] for r in cur.fetchall()]
            out["tables"] = tables
            counts = {}
            for t in tables:
                try:
                    cur.execute(f'SELECT COUNT(*) FROM "{t}"')
                    counts[t] = cur.fetchone()[0]
                except Exception:
                    pass
            out["counts"] = counts
            con.close()
            out["notes"] = "Plain SQLite database — Vyapar tables can be extracted directly."
        except Exception as e:
            out["notes"] = f"SQLite open failed: {e}"
        return out
    if head[:2] == b"PK":
        # could be xlsx or zip — sniff by extension first
        if path.suffix.lower() in (".xlsx", ".xls"):
            out["kind"] = "xlsx"
            try:
                from openpyxl import load_workbook
                wb = load_workbook(filename=str(path), read_only=True, data_only=True)
                out["tables"] = wb.sheetnames
                counts = {}
                for s in wb.sheetnames:
                    ws = wb[s]
                    counts[s] = max(0, (ws.max_row or 1) - 1)
                out["counts"] = counts
                wb.close()
                out["notes"] = "Excel workbook — sheets will be mapped to Parties / Items / Sales / Purchases by column heuristics."
            except Exception as e:
                out["notes"] = f"Excel read failed: {e}"
            return out
        out["kind"] = "zip"
        try:
            with zipfile.ZipFile(path) as z:
                names = z.namelist()
                out["tables"] = names[:50]
                inner_sqlite = [n for n in names if n.endswith(".db") or n.endswith(".sqlite") or n.endswith(".vyp")]
                if inner_sqlite:
                    out["notes"] = f"Vyapar backup container — extracting {inner_sqlite[0]} for inspection."
                    # Extract the inner DB and recurse so we can preview the real tables
                    import tempfile
                    tmpd = Path(tempfile.mkdtemp())
                    z.extract(inner_sqlite[0], tmpd)
                    inner_path = tmpd / inner_sqlite[0]
                    inner_info = _vyb_inspect(inner_path)
                    if inner_info.get("kind") == "sqlite":
                        # Replace the inspect result with the inner SQLite analysis but keep the
                        # outer kind=zip so import logic knows it must unzip first.
                        out["kind"] = "zip_sqlite"
                        out["inner_sqlite"] = inner_sqlite[0]
                        out["tables"] = inner_info.get("tables", [])
                        out["counts"] = inner_info.get("counts", {})
                        out["notes"] = ("Vyapar SQLite backup — " + (
                            f"{out['counts'].get('kb_names', 0)} parties, "
                            f"{out['counts'].get('kb_items', 0)} items, "
                            f"{out['counts'].get('kb_transactions', 0)} transactions."))
                else:
                    out["notes"] = "Archive contains: " + ", ".join(names[:10])
        except Exception as e:
            out["notes"] = f"ZIP read failed: {e}"
        return out
    if path.suffix.lower() == ".csv":
        out["kind"] = "csv"
        try:
            import csv as _csv
            with open(path, "r", encoding="utf-8-sig", errors="replace", newline="") as f:
                rdr = _csv.reader(f); rows = list(rdr)
            if rows:
                out["tables"] = [",".join(rows[0][:10])]
                out["counts"] = {"rows": len(rows) - 1}
            out["notes"] = "CSV file."
        except Exception as e:
            out["notes"] = f"CSV read failed: {e}"
        return out
    out["kind"] = "unsupported"
    out["notes"] = ("This file is encrypted or in a proprietary Vyapar format we cannot decrypt without their internal keys. "
                    "The reliable workaround is to export Excel files from Vyapar's Reports menu (Sale, Party, Item, Purchase). "
                    "Re-upload the .xlsx file here.")
    return out

def _norm(s: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s or "").strip().lower())

PARTY_COLS = {"name": ["name", "partyname", "customername", "suppliername"],
              "phone": ["phone", "mobile", "phoneno", "mobileno", "contact", "contactno"],
              "email": ["email", "emailid"],
              "gstin": ["gstin", "gstno", "gst"],
              "address": ["address", "billingaddress"],
              "state": ["state", "billingstate"]}
ITEM_COLS  = {"name": ["itemname", "name", "productname"],
              "hsn": ["hsnsac", "hsn", "hsncode", "sac"],
              "sale_price": ["saleprice", "price", "rate", "mrp"],
              "purchase_price": ["purchaseprice", "cost"],
              "stock": ["openingstock", "stock", "currentstock", "quantity"],
              "unit": ["unit", "uom"]}
SALE_COLS  = {"code": ["invoiceno", "saleinvoiceno", "billno", "refno"],
              "date": ["date", "invoicedate"],
              "customer_name": ["partyname", "customername"],
              "total": ["totalamount", "amount", "total", "grandtotal"],
              "balance": ["balance", "balancedue"],
              "payment_type": ["paymentmode", "paymenttype"]}
PURCHASE_COLS = {"code": ["billno", "purchaseno", "refno", "invoiceno"],
                 "date": ["date", "billdate"],
                 "supplier_name": ["partyname", "suppliername"],
                 "total": ["totalamount", "amount", "total", "grandtotal"]}

def _classify_sheet(headers: List[str]) -> str:
    h = [_norm(x) for x in headers]
    score = {"sales": 0, "purchases": 0, "items": 0, "parties": 0}
    for col in h:
        if col in {"invoiceno", "saleinvoiceno", "billno"}: score["sales"] += 2
        if col in {"purchaseno"}: score["purchases"] += 2
        if col in {"itemname", "hsnsac", "saleprice", "purchaseprice", "openingstock"}: score["items"] += 1
        if col in {"partyname", "customername", "suppliername", "gstin", "mobileno"}: score["parties"] += 1
        if col in {"totalamount", "grandtotal"} and "partyname" in h: score["sales"] += 1
    best = max(score, key=score.get)
    return best if score[best] > 0 else "unknown"

def _map_row(row: Dict[str, Any], schema: Dict[str, List[str]]) -> Dict[str, Any]:
    norm = {_norm(k): v for k, v in row.items()}
    out: Dict[str, Any] = {}
    for canonical, synonyms in schema.items():
        for s in synonyms:
            if s in norm and norm[s] not in (None, "", "—"):
                out[canonical] = norm[s]
                break
    return out

class VyaparImportIn(BaseModel):
    token: str
    parties: bool = True
    items: bool = True
    sales: bool = True
    purchases: bool = True
    dry_run: bool = False

@api.post("/integrations/vyapar/inspect")
async def vyapar_inspect(file: UploadFile = File(...), user=Depends(require_roles("admin"))):
    if not file.filename:
        raise HTTPException(400, "No file")
    token = new_id()
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename)[-80:]
    path = VYAPAR_UPLOAD_DIR / f"{token}_{safe_name}"
    raw = await file.read()
    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large (>50 MB)")
    path.write_bytes(raw)
    info = await asyncio.to_thread(_vyb_inspect, path)
    info["token"] = token
    info["filename"] = safe_name
    info["size_bytes"] = len(raw)
    await db.vyapar_uploads.insert_one({
        "id": token, "user_id": user["id"], "filename": safe_name,
        "path": str(path), "kind": info.get("kind"), "created_at": now_iso(),
    })
    return info

async def _do_import_sqlite(path: Path, opts: VyaparImportIn, auto_seed_company: bool = True) -> Dict[str, Any]:
    """Import a Vyapar SQLite DB. Recognises kb_* tables (Vyapar's real schema)."""
    import sqlite3
    res = {"parties": 0, "items": 0, "sales": 0, "purchases": 0,
           "quotations": 0, "sale_orders": 0, "purchase_orders": 0,
           "delivery_challans": 0, "job_work_out": 0, "sale_returns": 0,
           "company_seeded": False}
    con = sqlite3.connect(str(path)); con.row_factory = sqlite3.Row
    cur = con.cursor()

    # --- Detect schema: native Vyapar (kb_*) vs generic ---
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {r[0].lower(): r[0] for r in cur.fetchall()}
    is_vyapar = "kb_names" in tables and "kb_transactions" in tables and "kb_items" in tables

    if not is_vyapar:
        # Fall back to generic best-effort (unchanged behavior for non-Vyapar SQLite)
        return await _do_import_generic_sqlite(path, opts)

    # --- Auto-seed company from kb_firms (only if user hasn't already saved) ---
    if auto_seed_company and "kb_firms" in tables:
        try:
            cur.execute('SELECT * FROM "kb_firms" LIMIT 1')
            f = cur.fetchone()
            if f:
                f = {k: f[k] for k in f.keys()}
                existing = await get_setting("integrations") or {}
                # Only fill blanks; never overwrite something the user already set
                payload: Dict[str, Any] = {**existing}
                for src_key, dst_key in [
                    ("firm_name", "company_name"),
                    ("firm_phone", "company_phone"),
                    ("firm_email", "company_email"),
                    ("firm_address", "company_address"),
                    ("firm_gstin_number", "company_gstin"),
                    ("firm_state", "company_state"),
                    ("firm_bank_name", "bank_name"),
                    ("firm_bank_account_number", "bank_account_no"),
                    ("firm_bank_ifsc_code", "bank_ifsc"),
                ]:
                    if not payload.get(dst_key) and f.get(src_key):
                        payload[dst_key] = str(f[src_key])
                # UDYAM is embedded in firm_address; extract if present and not set
                if not payload.get("company_udyam") and f.get("firm_address"):
                    m = re.search(r"UDYAM-[A-Z]+-\d+-\d+", str(f["firm_address"]))
                    if m:
                        payload["company_udyam"] = m.group(0)
                if not opts.dry_run:
                    await set_setting("integrations", payload)
                    res["company_seeded"] = True
        except Exception:
            pass

    # --- HSN tax-id → rate lookup (kb_tax_code) ---
    tax_rate: Dict[int, float] = {}
    if "kb_tax_code" in tables:
        try:
            cur.execute('SELECT tax_code_id, tax_rate FROM "kb_tax_code"')
            for r in cur.fetchall():
                tax_rate[int(r["tax_code_id"])] = float(r["tax_rate"] or 0)
        except Exception:
            pass

    # --- Parties (kb_names) ---
    if opts.parties:
        # name_type: 1 = party (customer/supplier), 2 = other
        cur.execute('SELECT * FROM "kb_names" WHERE name_type IN (1,2)')
        for r in cur.fetchall():
            full_name = (r["full_name"] or "").strip()
            if not full_name:
                continue
            doc = {
                "id": new_id(),
                "name": full_name[:160],
                "phone": str(r["phone_number"] or "").strip(),
                "email": str(r["email"] or "").strip(),
                "gstin": str(r["name_gstin_number"] or "").strip(),
                "address": str(r["address"] or "").strip(),
                "state": str(r["name_state"] or "").strip(),
                "vyapar_id": str(r["name_id"]),
                "source": "vyapar",
                "created_at": str(r["date_created"] or now_iso()),
            }
            if not opts.dry_run:
                # Vyapar doesn't distinguish C/S until used in txns; we'll route them by usage below.
                await db.customers.update_one({"name": doc["name"]}, {"$setOnInsert": doc}, upsert=True)
                await db.suppliers.update_one({"name": doc["name"]}, {"$setOnInsert": doc}, upsert=True)
            res["parties"] += 1

    # Build name_id -> party_name map for txn rows
    name_lookup: Dict[int, str] = {}
    try:
        cur.execute('SELECT name_id, full_name FROM "kb_names"')
        for r in cur.fetchall():
            if r["full_name"]:
                name_lookup[int(r["name_id"])] = r["full_name"].strip()
    except Exception:
        pass

    # --- Items (kb_items) ---
    if opts.items:
        cur.execute('SELECT * FROM "kb_items" WHERE item_is_active IS NULL OR item_is_active != 0')
        for r in cur.fetchall():
            name = (r["item_name"] or "").strip()
            if not name or name == "item 1":  # skip the default placeholder
                continue
            sku_raw = (r["item_code"] or f"VY-{r['item_id']}").strip()[:32] or f"VY-{r['item_id']}"
            doc = {
                "id": new_id(),
                "sku": sku_raw,
                "name": name[:200],
                "category": "raw",
                "uom": "pcs",
                "qty_on_hand": float(r["item_stock_quantity"] or 0),
                "qty_in_process": 0.0,
                "reorder_level": float(r["item_min_stock_quantity"] or 0),
                "unit_cost": float(r["item_purchase_unit_price"] or 0) or float(r["item_sale_unit_price"] or 0),
                "hsn": str(r["item_hsn_sac_code"] or "").strip(),
                "gst_rate": 18.0,
                "location": "",
                "sale_price": float(r["item_sale_unit_price"] or 0),
                "description": str(r["item_description"] or "").strip(),
                "vyapar_id": str(r["item_id"]),
                "source": "vyapar",
                "created_at": str(r["item_date_created"] or now_iso()),
            }
            if not opts.dry_run:
                await db.items.update_one({"name": doc["name"]}, {"$setOnInsert": doc}, upsert=True)
            res["items"] += 1

    # Build item_id -> (name, hsn, rate) for line items
    item_lookup: Dict[int, Dict[str, Any]] = {}
    try:
        cur.execute('SELECT item_id, item_name, item_hsn_sac_code, item_sale_unit_price FROM "kb_items"')
        for r in cur.fetchall():
            item_lookup[int(r["item_id"])] = {
                "name": (r["item_name"] or "").strip(),
                "hsn": (r["item_hsn_sac_code"] or "").strip(),
                "rate": float(r["item_sale_unit_price"] or 0),
            }
    except Exception:
        pass

    # --- Line items pre-grouped by txn_id ---
    lines_by_txn: Dict[int, List[Dict[str, Any]]] = {}
    try:
        cur.execute('SELECT * FROM "kb_lineitems"')
        for r in cur.fetchall():
            tx = int(r["lineitem_txn_id"])
            it = item_lookup.get(int(r["item_id"]) if r["item_id"] is not None else -1, {})
            qty = float(r["quantity"] or 0)
            rate = float(r["priceperunit"] or 0)
            disc_amt = float(r["lineitem_discount_amount"] or 0)
            tax_amt = float(r["lineitem_tax_amount"] or 0)
            taxable = max(qty * rate - disc_amt, 0.000001)
            implied_gst_rate = round(tax_amt / taxable * 100, 2) if tax_amt else 0
            lines_by_txn.setdefault(tx, []).append({
                "description": (r["lineitem_description"] or it.get("name", "")).strip() or it.get("name", ""),
                "hsn": it.get("hsn", ""),
                "qty": qty,
                "rate": rate,
                "discount_amount": disc_amt,
                "discount_pct": float(r["lineitem_discount_percent"] or 0),
                "gst_rate": implied_gst_rate,
                "gst_amount": tax_amt,
            })
    except Exception:
        pass

    # --- Transactions: route by txn_type ---
    # Vyapar txn_type: 1=Sale, 2=Purchase, 7=Sale Return, 21=Estimate/Quotation,
    # 23=Delivery Challan, 27=Purchase Order, 28=Sale Order, 30=Job Work Out
    TYPE_ROUTES = {
        1:  ("invoices", "sales", "customer", "Tax Invoice"),
        2:  ("vendor_bills", "purchases", "supplier", "Purchase Bill"),
        7:  ("credit_notes", "sale_returns", "customer", "Credit Note"),
        21: ("quotations", "quotations", "customer", "Estimate"),
        23: ("delivery_challans", "delivery_challans", "customer", "Delivery Challan"),
        24: ("delivery_challans", "delivery_challans", "customer", "Delivery Challan"),
        27: ("purchase_orders", "purchase_orders", "supplier", "Purchase Order"),
        28: ("sale_orders", "sale_orders", "customer", "Sale Order"),
        30: ("job_work_out", "job_work_out", "customer", "Job Work Out Challan"),
    }
    cur.execute("SELECT * FROM kb_transactions")
    for r in cur.fetchall():
        t = int(r["txn_type"]) if r["txn_type"] is not None else 0
        route = TYPE_ROUTES.get(t)
        if not route:
            continue
        collection_name, counter_key, party_kind, _title = route
        # Honour user toggles
        if party_kind == "customer" and (counter_key == "sales") and not opts.sales: continue
        if party_kind == "supplier" and (counter_key == "purchases") and not opts.purchases: continue
        if counter_key not in ("sales", "purchases") and not opts.sales and party_kind == "customer": continue

        party_name = name_lookup.get(int(r["txn_name_id"]) if r["txn_name_id"] is not None else -1, "Unknown")
        ref = (r["txn_ref_number_char"] or "").strip()
        prefix = (r["txn_invoice_prefix"] or "").strip()
        code = (f"{prefix}{ref}" if ref else f"VY-{r['txn_id']}").strip()
        cash = float(r["txn_cash_amount"] or 0)
        bal = float(r["txn_balance_amount"] or 0)
        total = cash + bal
        sub = max(total - float(r["txn_tax_amount"] or 0), 0)
        ln = lines_by_txn.get(int(r["txn_id"]), [])
        # Split GST based on place_of_supply vs firm_state (heuristic: if intra-state, half/half; if interstate, all IGST)
        is_interstate = bool(r["txn_place_of_supply"]) and "gujarat" not in str(r["txn_place_of_supply"]).lower()
        tax_total = float(r["txn_tax_amount"] or 0)
        cgst = 0.0; sgst = 0.0; igst = 0.0
        if is_interstate: igst = tax_total
        else: cgst = sgst = tax_total / 2

        doc: Dict[str, Any] = {
            "id": new_id(),
            "code": code,
            "date": str(r["txn_date"] or "")[:19] or now_iso(),
            "due_date": str(r["txn_due_date"] or "")[:10],
            "lines": ln,
            "subtotal": sub,
            "total": total,
            "notes": (r["txn_description"] or "").strip(),
            "place_of_supply": (r["txn_place_of_supply"] or "").strip(),
            "is_interstate": is_interstate,
            "vyapar_id": str(r["txn_id"]),
            "vyapar_txn_type": t,
            "source": "vyapar",
            "created_at": str(r["txn_date_created"] or now_iso()),
        }
        if party_kind == "customer":
            doc["customer_id"] = ""
            doc["customer_name"] = party_name
            doc["cgst"] = cgst; doc["sgst"] = sgst; doc["igst"] = igst
            doc["gst_total"] = tax_total
            doc["status"] = "paid" if bal == 0 else "sent"
        else:
            doc["supplier_id"] = ""
            doc["supplier_name"] = party_name
            doc["gst_total"] = tax_total
            doc["status"] = "received" if bal == 0 else "open"

        if not opts.dry_run:
            target = getattr(db, collection_name)
            await target.update_one({"code": doc["code"], "vyapar_id": doc["vyapar_id"]},
                                    {"$setOnInsert": doc}, upsert=True)
        # Increment counter
        if t == 1: res["sales"] += 1
        elif t == 2: res["purchases"] += 1
        elif t == 7: res["sale_returns"] += 1
        elif t == 21: res["quotations"] += 1
        elif t in (23, 24): res["delivery_challans"] += 1
        elif t == 27: res["purchase_orders"] += 1
        elif t == 28: res["sale_orders"] += 1
        elif t == 30: res["job_work_out"] += 1

    con.close()
    return res

async def _do_import_generic_sqlite(path: Path, opts: VyaparImportIn) -> Dict[str, Any]:
    """Fallback for non-Vyapar SQLite DBs (e.g. an exported generic db). Best-effort."""
    import sqlite3
    res = {"parties": 0, "items": 0, "sales": 0, "purchases": 0}
    con = sqlite3.connect(str(path)); con.row_factory = sqlite3.Row
    cur = con.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {r[0].lower(): r[0] for r in cur.fetchall()}
    def _try_select(candidates: List[str]):
        for c in candidates:
            if c.lower() in tables:
                try:
                    cur.execute(f'SELECT * FROM "{tables[c.lower()]}"'); return cur.fetchall()
                except Exception: pass
        return None
    if opts.parties:
        for r in _try_select(["parties", "party"]) or []:
            d = {k: r[k] for k in r.keys()}; p = _map_row(d, PARTY_COLS)
            if not p.get("name"): continue
            doc = {"id": new_id(), "name": str(p["name"])[:120], "phone": str(p.get("phone","") or ""),
                   "email": str(p.get("email","") or ""), "gstin": str(p.get("gstin","") or ""),
                   "address": str(p.get("address","") or ""), "state": str(p.get("state","") or ""),
                   "source": "vyapar", "created_at": now_iso()}
            if not opts.dry_run:
                await db.customers.update_one({"name": doc["name"]}, {"$setOnInsert": doc}, upsert=True)
            res["parties"] += 1
    con.close()
    return res

async def _do_import_xlsx(path: Path, opts: VyaparImportIn) -> Dict[str, Any]:
    from openpyxl import load_workbook
    res = {"parties": 0, "items": 0, "sales": 0, "purchases": 0}
    wb = load_workbook(filename=str(path), read_only=True, data_only=True)
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        it = ws.iter_rows(values_only=True)
        try:
            headers_row = next(it)
        except StopIteration:
            continue
        headers = [str(h or "").strip() for h in headers_row]
        if not any(headers): continue
        kind = _classify_sheet(headers)
        rows = []
        for r in it:
            d = {headers[i]: (r[i] if i < len(r) else None) for i in range(len(headers))}
            rows.append(d)
        if kind == "parties" and opts.parties:
            for d in rows:
                p = _map_row(d, PARTY_COLS)
                if not p.get("name"): continue
                doc = {"id": new_id(), "name": str(p["name"])[:120],
                       "phone": str(p.get("phone","") or ""), "email": str(p.get("email","") or ""),
                       "gstin": str(p.get("gstin","") or ""), "address": str(p.get("address","") or ""),
                       "state": str(p.get("state","") or ""), "source": "vyapar", "created_at": now_iso()}
                if not opts.dry_run:
                    await db.customers.update_one({"name": doc["name"]}, {"$setOnInsert": doc}, upsert=True)
                res["parties"] += 1
        elif kind == "items" and opts.items:
            for d in rows:
                it_ = _map_row(d, ITEM_COLS)
                if not it_.get("name"): continue
                doc = {"id": new_id(), "item_code": "VY-" + new_id()[:8].upper(),
                       "name": str(it_["name"])[:160], "hsn": str(it_.get("hsn","") or ""),
                       "unit": str(it_.get("unit","NOS") or "NOS"),
                       "rate": float(it_.get("sale_price") or 0), "stock": float(it_.get("stock") or 0),
                       "reorder_level": 0, "source": "vyapar", "created_at": now_iso()}
                if not opts.dry_run:
                    await db.items.update_one({"name": doc["name"]}, {"$setOnInsert": doc}, upsert=True)
                res["items"] += 1
        elif kind == "sales" and opts.sales:
            for d in rows:
                s = _map_row(d, SALE_COLS)
                if not s.get("code"): continue
                doc = {"id": new_id(), "code": "VY-" + str(s["code"]),
                       "customer_id": "", "customer_name": str(s.get("customer_name","") or "Unknown"),
                       "date": str(s.get("date") or now_iso())[:19],
                       "lines": [], "subtotal": float(s.get("total") or 0),
                       "cgst": 0, "sgst": 0, "igst": 0,
                       "total": float(s.get("total") or 0),
                       "status": "paid" if (float(s.get("balance") or 0) == 0) else "sent",
                       "source": "vyapar", "created_at": now_iso()}
                if not opts.dry_run:
                    await db.invoices.update_one({"code": doc["code"]}, {"$setOnInsert": doc}, upsert=True)
                res["sales"] += 1
        elif kind == "purchases" and opts.purchases:
            for d in rows:
                p = _map_row(d, PURCHASE_COLS)
                if not p.get("code"): continue
                doc = {"id": new_id(), "code": "VY-" + str(p["code"]),
                       "supplier_id": "", "supplier_name": str(p.get("supplier_name","") or "Unknown"),
                       "date": str(p.get("date") or now_iso())[:19],
                       "lines": [], "subtotal": float(p.get("total") or 0),
                       "gst_total": 0, "total": float(p.get("total") or 0),
                       "status": "received", "source": "vyapar", "created_at": now_iso()}
                if not opts.dry_run:
                    await db.purchase_orders.update_one({"code": doc["code"]}, {"$setOnInsert": doc}, upsert=True)
                res["purchases"] += 1
    wb.close()
    return res

@api.post("/integrations/vyapar/import")
async def vyapar_import(payload: VyaparImportIn, user=Depends(require_roles("admin"))):
    meta = await db.vyapar_uploads.find_one({"id": payload.token, "user_id": user["id"]}, {"_id": 0})
    if not meta:
        raise HTTPException(404, "Upload not found. Re-upload the file.")
    path = Path(meta["path"])
    if not path.exists():
        raise HTTPException(404, "Uploaded file is no longer on disk. Please re-upload.")
    kind = meta.get("kind")
    if kind in ("zip", "zip_sqlite"):
        import zipfile, tempfile
        with zipfile.ZipFile(path) as z:
            inner = [n for n in z.namelist() if n.endswith(".db") or n.endswith(".sqlite") or n.endswith(".vyp")]
            if not inner:
                raise HTTPException(400, "Archive doesn't contain a SQLite database.")
            tmpd = Path(tempfile.mkdtemp())
            z.extract(inner[0], tmpd)
            path = tmpd / inner[0]
            kind = "sqlite"
    if kind == "sqlite":
        details = await _do_import_sqlite(path, payload)
    elif kind == "xlsx":
        details = await _do_import_xlsx(path, payload)
    else:
        raise HTTPException(400, f"Cannot import file kind '{kind}'. Please export an Excel file from Vyapar (Reports → Sale/Party/Item/Purchase Report → Excel icon).")
    await write_audit(user["name"], "vyapar_import", "import", payload.token,
                      {**details, "dry_run": payload.dry_run})
    bits = [f"{details.get(k,0)} {k.replace('_',' ')}" for k in
            ("parties","items","sales","purchases","quotations","sale_orders","purchase_orders","delivery_challans","job_work_out","sale_returns")
            if details.get(k)]
    summary = " · ".join(bits) or "nothing matched"
    if payload.dry_run: summary += " (dry run)"
    if details.get("company_seeded"): summary += " · company details auto-filled"
    return {"ok": True, "summary": summary, "details": details, "dry_run": payload.dry_run}




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
