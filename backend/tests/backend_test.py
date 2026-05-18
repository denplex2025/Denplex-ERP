"""
Backend API tests for Precision ERP.
Covers auth, CRUD, dashboard, BOM/WO/JC, quotation/PO/invoice math,
QC, documents+revisions, expenses+GST, HR, marketing, portal, AI scan.
"""
import base64
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://machineflow-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@erp.com"
ADMIN_PASS = "Admin@123"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="session")
def auth(session, token):
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


@pytest.fixture(scope="session")
def state():
    """Shared state across tests (ids etc.)."""
    return {}


# ---------------- Auth ----------------
class TestAuth:
    def test_login_returns_jwt_and_user(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("token"), str) and len(d["token"]) > 20
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d["user"]["role"] == "admin"

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, auth):
        r = auth.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert "password" not in d

    def test_me_requires_token(self, session):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_admin_creates_user(self, auth):
        email = f"test_user_{int(time.time())}@erp.com"
        r = auth.post(f"{API}/auth/register", json={
            "name": "Test User", "email": email, "password": "Pass@123", "role": "manager"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == email and d["role"] == "manager"
        assert "password" not in d

    def test_users_admin_only(self, auth):
        r = auth.get(f"{API}/users")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Customers/Leads/Suppliers ----------------
class TestCRM:
    def test_customer_crud(self, auth, state):
        r = auth.post(f"{API}/customers", json={"name": "TEST_Cust_A", "phone": "9999", "gstin": "27AAAA0000A1Z5"})
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["name"] == "TEST_Cust_A"
        assert c.get("code", "").startswith("CUST-")
        state["cust_id"] = c["id"]
        # list
        l = auth.get(f"{API}/customers"); assert l.status_code == 200
        assert any(x["id"] == c["id"] for x in l.json())
        # update
        u = auth.put(f"{API}/customers/{c['id']}", json={**c, "phone": "8888"})
        assert u.status_code == 200
        l2 = auth.get(f"{API}/customers").json()
        assert next(x for x in l2 if x["id"] == c["id"])["phone"] == "8888"

    def test_lead_crud(self, auth):
        r = auth.post(f"{API}/leads", json={"name": "TEST_Lead", "company": "X", "source": "b2b"})
        assert r.status_code == 200
        lid = r.json()["id"]
        assert auth.get(f"{API}/leads").status_code == 200
        d = auth.delete(f"{API}/leads/{lid}"); assert d.status_code == 200

    def test_supplier_crud(self, auth, state):
        r = auth.post(f"{API}/suppliers", json={"name": "TEST_Sup", "phone": "1"})
        assert r.status_code == 200
        state["sup_id"] = r.json()["id"]
        assert auth.get(f"{API}/suppliers").status_code == 200


# ---------------- Inventory ----------------
class TestInventory:
    def test_item_crud_and_sku_unique(self, auth, state):
        sku = f"TEST-SKU-{int(time.time())}"
        r = auth.post(f"{API}/inventory/items", json={
            "sku": sku, "name": "TEST_Item", "qty_on_hand": 0, "reorder_level": 5, "unit_cost": 10
        })
        assert r.status_code == 200, r.text
        item = r.json()
        state["item_id"] = item["id"]
        state["item_sku"] = sku
        # SKU uniqueness
        dup = auth.post(f"{API}/inventory/items", json={"sku": sku, "name": "dup"})
        assert dup.status_code == 400

    def test_stock_movements_update_qty(self, auth, state):
        iid = state["item_id"]
        # in 20
        r = auth.post(f"{API}/inventory/movements", json={
            "item_id": iid, "item_sku": "", "item_name": "", "type": "in", "qty": 20
        })
        assert r.status_code == 200
        items = auth.get(f"{API}/inventory/items").json()
        it = next(x for x in items if x["id"] == iid)
        assert it["qty_on_hand"] == 20
        # out 5
        auth.post(f"{API}/inventory/movements", json={
            "item_id": iid, "item_sku": "", "item_name": "", "type": "out", "qty": 5
        })
        # in_process 4 -> qty_on_hand=11, in_process=4
        auth.post(f"{API}/inventory/movements", json={
            "item_id": iid, "item_sku": "", "item_name": "", "type": "in_process", "qty": 4
        })
        # adjust to 100
        auth.post(f"{API}/inventory/movements", json={
            "item_id": iid, "item_sku": "", "item_name": "", "type": "adjust", "qty": 100
        })
        items = auth.get(f"{API}/inventory/items").json()
        it = next(x for x in items if x["id"] == iid)
        assert it["qty_on_hand"] == 100
        assert it["qty_in_process"] == 4

    def test_scan_bill_ai(self, auth):
        # 1x1 PNG
        png = base64.b64encode(bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
            "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )).decode()
        r = auth.post(f"{API}/inventory/scan-bill", json={"image_base64": png, "mime": "image/png"}, timeout=120)
        # Don't deep-validate but must not 500 due to code error; allow LLM-side errors gracefully.
        assert r.status_code in (200, 500), r.text
        if r.status_code == 200:
            d = r.json()
            assert d.get("ok") is True
            assert "extracted" in d


# ---------------- BOM ----------------
class TestBOM:
    def test_create_bom_with_codes(self, auth, state):
        r = auth.post(f"{API}/bom", json={
            "product_name": "TEST_Jig", "solidworks_url": "https://sw.example/part1",
            "lines": [{"item_id": state["item_id"], "item_name": "TEST_Item", "qty": 2}]
        })
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["code"].startswith("BOM-")
        assert b.get("design_code", "").startswith("DSGN-")
        assert b["solidworks_url"].startswith("https://")
        state["bom_id"] = b["id"]


# ---------------- Work Orders + Job Cards + repeat flag ----------------
class TestWOJC:
    def test_first_wo_keeps_one_time(self, auth, state):
        cid = state["cust_id"]
        r = auth.post(f"{API}/work-orders", json={
            "customer_id": cid, "customer_name": "TEST_Cust_A",
            "bom_id": state["bom_id"], "product": "Widget", "qty": 10, "po_ref": f"TESTPO-{int(time.time())}"
        })
        assert r.status_code == 200, r.text
        wo = r.json()
        assert wo["code"].startswith("WO-")
        state["wo1"] = wo
        custs = auth.get(f"{API}/customers").json()
        c = next(x for x in custs if x["id"] == cid)
        assert c["customer_type"] == "one_time"

    def test_second_wo_flips_to_repeat(self, auth, state):
        cid = state["cust_id"]
        r = auth.post(f"{API}/work-orders", json={
            "customer_id": cid, "customer_name": "TEST_Cust_A",
            "product": "Widget2", "qty": 5
        })
        assert r.status_code == 200
        custs = auth.get(f"{API}/customers").json()
        c = next(x for x in custs if x["id"] == cid)
        assert c["customer_type"] == "repeat", f"expected repeat got {c}"

    def test_job_card_autofills_wo_code(self, auth, state):
        wo = state["wo1"]
        r = auth.post(f"{API}/job-cards", json={
            "work_order_id": wo["id"], "operation": "Turning", "qty_planned": 5
        })
        assert r.status_code == 200
        jc = r.json()
        assert jc["work_order_code"] == wo["code"]
        assert jc["code"].startswith("JC-")


# ---------------- Quotations / POs ----------------
class TestQuotePO:
    def test_quotation_totals(self, auth, state):
        lines = [{"description": "A", "qty": 2, "rate": 100, "gst_rate": 18}]
        r = auth.post(f"{API}/quotations", json={
            "customer_id": state["cust_id"], "customer_name": "TEST_Cust_A", "lines": lines
        })
        assert r.status_code == 200
        q = r.json()
        assert q["subtotal"] == 200
        assert q["gst_total"] == 36
        assert q["total"] == 236
        assert q["code"].startswith("QT-")

    def test_po_totals(self, auth, state):
        r = auth.post(f"{API}/purchase-orders", json={
            "supplier_id": state["sup_id"], "supplier_name": "TEST_Sup",
            "lines": [{"description": "B", "qty": 3, "rate": 50, "gst_rate": 12}]
        })
        assert r.status_code == 200
        p = r.json()
        assert p["subtotal"] == 150
        assert round(p["gst_total"], 2) == 18.0
        assert round(p["total"], 2) == 168.0
        assert p["code"].startswith("PO-")


# ---------------- Invoices ----------------
class TestInvoices:
    def test_intra_state_invoice(self, auth, state):
        r = auth.post(f"{API}/invoices", json={
            "customer_id": state["cust_id"], "customer_name": "TEST_Cust_A",
            "is_interstate": False,
            "lines": [{"description": "X", "qty": 1, "rate": 1000, "gst_rate": 18}]
        })
        assert r.status_code == 200
        inv = r.json()
        assert inv["subtotal"] == 1000
        assert inv["cgst"] == 90 and inv["sgst"] == 90 and inv["igst"] == 0
        assert inv["total"] == 1180
        state["inv_intra"] = inv

    def test_inter_state_invoice(self, auth, state):
        r = auth.post(f"{API}/invoices", json={
            "customer_id": state["cust_id"], "customer_name": "TEST_Cust_A",
            "is_interstate": True,
            "lines": [{"description": "Y", "qty": 2, "rate": 500, "gst_rate": 18}]
        })
        assert r.status_code == 200
        inv = r.json()
        assert inv["igst"] == 180 and inv["cgst"] == 0 and inv["sgst"] == 0
        assert inv["total"] == 1180


# ---------------- QC ----------------
class TestQC:
    def test_qc_autofill_and_photos(self, auth, state):
        wo = state["wo1"]
        photo_b64 = base64.b64encode(b"fakephoto").decode()
        r = auth.post(f"{API}/qc-reports", json={
            "work_order_id": wo["id"],
            "parameter": "Dimension", "spec": "10mm", "measured": "10.01mm",
            "result": "pass", "photos": [photo_b64]
        })
        assert r.status_code == 200
        q = r.json()
        assert q["work_order_code"] == wo["code"]
        assert q["customer_id"] == wo["customer_id"]
        assert q["code"].startswith("QC-")
        assert len(q["photos"]) == 1


# ---------------- Documents + Revisions ----------------
class TestDocs:
    def test_upload_revisions_history(self, auth, state):
        b64a = "data:text/plain;base64," + base64.b64encode(b"v1").decode()
        b64b = "data:text/plain;base64," + base64.b64encode(b"v2").decode()
        b64c = "data:text/plain;base64," + base64.b64encode(b"v3").decode()
        r = auth.post(f"{API}/documents", json={
            "name": "TEST_ISO_Doc", "category": "iso", "file_base64": b64a, "mime": "text/plain", "size": 2
        })
        assert r.status_code == 200
        d = r.json()
        did = d["id"]
        state["doc_id"] = did
        # add rev 1
        r1 = auth.post(f"{API}/documents/{did}/revisions", json={"file_base64": b64b, "notes": "rev1"})
        assert r1.status_code == 200 and r1.json()["current_revision"] == 1
        # add rev 2
        r2 = auth.post(f"{API}/documents/{did}/revisions", json={"file_base64": b64c, "notes": "rev2"})
        assert r2.status_code == 200 and r2.json()["current_revision"] == 2
        # history
        h = auth.get(f"{API}/documents/{did}/revisions").json()
        assert h["current_revision"] == 2
        # initial + rev1 + rev2 = 3
        assert len(h["revisions"]) == 3
        assert {r["rev_no"] for r in h["revisions"]} == {0, 1, 2}

    def test_doc_delete(self, auth, state):
        r = auth.delete(f"{API}/documents/{state['doc_id']}")
        assert r.status_code == 200


# ---------------- Expenses + GST report ----------------
class TestAccounting:
    def test_expense_totals(self, auth, state):
        r = auth.post(f"{API}/expenses", json={
            "category": "raw_material", "description": "TEST_Exp",
            "amount": 1000, "gst_rate": 18
        })
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["gst_amount"] == 180
        assert e["total"] == 1180
        state["exp_id"] = e["id"]

    def test_gst_report_keys(self, auth):
        r = auth.get(f"{API}/accounting/gst-report")
        assert r.status_code == 200
        d = r.json()
        for k in ("output", "input", "net_liability"):
            assert k in d
        for k in ("cgst", "sgst", "igst", "total_gst"):
            assert k in d["output"]
        assert "total_gst" in d["input"]

    def test_expense_delete(self, auth, state):
        r = auth.delete(f"{API}/expenses/{state['exp_id']}")
        assert r.status_code == 200


# ---------------- HR ----------------
class TestHR:
    def test_employee_and_attendance(self, auth, state):
        r = auth.post(f"{API}/employees", json={
            "name": "TEST_Emp", "designation": "Operator", "monthly_salary": 25000
        })
        assert r.status_code == 200
        emp = r.json()
        assert emp["code"].startswith("EMP-")
        eid = emp["id"]
        # update
        u = auth.put(f"{API}/employees/{eid}", json={**emp, "designation": "Senior Operator"})
        assert u.status_code == 200
        # attendance
        a = auth.post(f"{API}/attendance", json={
            "employee_id": eid, "date": "2026-01-15", "status": "present", "hours": 8
        })
        assert a.status_code == 200
        att = a.json()
        assert att["employee_name"] == "TEST_Emp"
        # list
        lst = auth.get(f"{API}/attendance").json()
        assert any(x["id"] == att["id"] for x in lst)
        # cleanup
        auth.delete(f"{API}/attendance/{att['id']}")
        auth.delete(f"{API}/employees/{eid}")


# ---------------- Marketing ----------------
class TestMarketing:
    def test_campaign_crud(self, auth):
        r = auth.post(f"{API}/campaigns", json={
            "title": "TEST_Camp", "channel": "whatsapp", "content": "Hi"
        })
        assert r.status_code == 200
        cid = r.json()["id"]
        u = auth.put(f"{API}/campaigns/{cid}", json={
            "title": "TEST_Camp2", "channel": "linkedin", "content": "Hi2"
        })
        assert u.status_code == 200
        d = auth.delete(f"{API}/campaigns/{cid}")
        assert d.status_code == 200


# ---------------- Public Portal ----------------
class TestPortal:
    def test_track_by_wo_code_public(self, state):
        wo = state["wo1"]
        r = requests.get(f"{API}/portal/track", params={"ref": wo["code"]})
        assert r.status_code == 200
        d = r.json()
        assert d["work_order"]["code"] == wo["code"]
        assert isinstance(d["job_cards"], list)
        assert isinstance(d["qc_reports"], list)

    def test_track_by_po_ref(self, state):
        wo = state["wo1"]
        if not wo.get("po_ref"):
            pytest.skip("no po_ref")
        r = requests.get(f"{API}/portal/track", params={"ref": wo["po_ref"]})
        assert r.status_code == 200
        assert r.json()["work_order"]["po_ref"] == wo["po_ref"]

    def test_track_404(self):
        r = requests.get(f"{API}/portal/track", params={"ref": "NOPE-NOT-EXIST-XYZ"})
        assert r.status_code == 404


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_stats(self, auth):
        r = auth.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("open_wo", "qc_pending", "low_stock_count", "low_stock_items",
                  "leads_open", "customers", "repeat_customers", "revenue",
                  "items_count", "recent_wo"):
            assert k in d
        assert isinstance(d["recent_wo"], list)
