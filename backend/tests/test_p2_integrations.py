"""
P2 layer backend tests:
- Settings/Integrations (admin only)
- Twilio WhatsApp / Resend email "not configured" branches
- Indiamart sync "not configured" branch
- TradeIndia webhook auth + lead creation + dedupe
- PDF generation (invoices/quotations/POs)
- GSTR-1 / GSTR-3B CSV exports
- 2FA TOTP (setup/enable/login-with-totp/disable)
- Audit log
- Role checks (non-admin denied)
- Regression sanity for previous P1 endpoints

Cleans up admin 2FA at the end so admin login keeps working.
"""
import base64
import os
import time
from typing import Any, Dict, Optional

import pyotp
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@erp.com"
ADMIN_PASS = "Admin@123"


# ----------------- helpers / fixtures -----------------
def _login(email: str, password: str, totp_code: Optional[str] = None):
    body: Dict[str, Any] = {"email": email, "password": password}
    if totp_code:
        body["totp_code"] = totp_code
    return requests.post(f"{API}/auth/login", json=body, timeout=30)


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASS)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="module")
def non_admin_token(admin):
    """Create a sales role user and return its login token."""
    email = f"test_sales_{int(time.time())}@erp.com"
    r = admin.post(f"{API}/auth/register", json={
        "name": "Test Sales", "email": email, "password": "Sales@123", "role": "sales"
    })
    assert r.status_code == 200, r.text
    lr = _login(email, "Sales@123")
    assert lr.status_code == 200, lr.text
    return lr.json()["token"]


@pytest.fixture(scope="module")
def non_admin(non_admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {non_admin_token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def reset_integrations(admin):
    """Ensure clean state - no integrations configured."""
    admin.put(f"{API}/settings/integrations", json={
        "twilio_account_sid": "", "twilio_auth_token": "", "twilio_whatsapp_from": "",
        "resend_api_key": "", "resend_from_email": "",
        "indiamart_crm_key": "", "tradeindia_webhook_secret": "",
        "company_name": "Precision Engineering Works",
        "company_gstin": "", "company_state": "", "company_address": ""
    })
    yield
    # Best-effort: clear secrets so admin login won't be impacted by webhook secret
    admin.put(f"{API}/settings/integrations", json={
        "twilio_account_sid": "", "twilio_auth_token": "", "twilio_whatsapp_from": "",
        "resend_api_key": "", "resend_from_email": "",
        "indiamart_crm_key": "", "tradeindia_webhook_secret": "",
        "company_name": "Precision Engineering Works",
        "company_gstin": "", "company_state": "", "company_address": ""
    })


# ----------------- Settings/Integrations -----------------
class TestSettingsIntegrations:
    def test_get_integrations_admin(self, admin):
        r = admin.get(f"{API}/settings/integrations")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_get_integrations_non_admin_forbidden(self, non_admin):
        r = non_admin.get(f"{API}/settings/integrations")
        assert r.status_code == 403, r.text

    def test_put_integrations_saves(self, admin):
        payload = {
            "twilio_account_sid": "", "twilio_auth_token": "", "twilio_whatsapp_from": "",
            "resend_api_key": "", "resend_from_email": "",
            "indiamart_crm_key": "", "tradeindia_webhook_secret": "",
            "company_name": "TEST_Company", "company_gstin": "27AAAA0000A1Z5",
            "company_state": "MH", "company_address": "Test addr"
        }
        r = admin.put(f"{API}/settings/integrations", json=payload)
        assert r.status_code == 200, r.text
        # GET back and verify persistence
        g = admin.get(f"{API}/settings/integrations").json()
        assert g["company_name"] == "TEST_Company"
        assert g["company_gstin"] == "27AAAA0000A1Z5"


# ----------------- "Not configured" branches -----------------
class TestUnconfiguredIntegrations:
    def test_whatsapp_not_configured(self, admin):
        r = admin.post(f"{API}/whatsapp/send", json={"to_phone": "+919999999999", "body": "hi"})
        assert r.status_code == 400, r.text
        assert "Twilio not configured" in r.text

    def test_email_not_configured(self, admin):
        r = admin.post(f"{API}/email/send", json={
            "to": ["someone@example.com"], "subject": "s", "html": "<p>h</p>"
        })
        assert r.status_code == 400, r.text
        assert "Resend not configured" in r.text or "Resend" in r.text

    def test_indiamart_not_configured(self, admin):
        r = admin.post(f"{API}/integrations/indiamart/sync")
        assert r.status_code == 400, r.text
        assert "Indiamart" in r.text

    def test_tradeindia_webhook_no_secret(self, admin):
        # Secret cleared in fixture; any token must 401
        r = requests.post(f"{API}/integrations/tradeindia/webhook?token=x",
                          json={"name": "x"}, timeout=15)
        assert r.status_code == 401, r.text


# ----------------- TradeIndia happy path -----------------
class TestTradeIndia:
    def test_webhook_creates_and_dedupes(self, admin):
        secret = "test_secret_abc"
        # set secret
        cur = admin.get(f"{API}/settings/integrations").json()
        cur["tradeindia_webhook_secret"] = secret
        u = admin.put(f"{API}/settings/integrations", json=cur)
        assert u.status_code == 200

        ext = f"TEST_TI_{int(time.time())}"
        # Wrong token -> 401
        bad = requests.post(f"{API}/integrations/tradeindia/webhook?token=WRONG",
                            json={"name": "X", "external_id": ext}, timeout=15)
        assert bad.status_code == 401

        # Correct token -> create
        ok = requests.post(f"{API}/integrations/tradeindia/webhook?token={secret}",
                           json={"name": "TEST_TI_Lead", "company": "TC",
                                 "phone": "9000000001", "email": "ti@x.com",
                                 "product": "Widget", "city": "Pune", "state": "MH",
                                 "external_id": ext}, timeout=15)
        assert ok.status_code == 200, ok.text
        assert ok.json().get("ok") is True

        # Duplicate -> skipped
        dup = requests.post(f"{API}/integrations/tradeindia/webhook?token={secret}",
                            json={"name": "dup", "external_id": ext}, timeout=15)
        assert dup.status_code == 200, dup.text
        assert dup.json().get("skipped") == "duplicate"

        # Verify lead source=tradeindia exists in leads list
        leads = admin.get(f"{API}/leads").json()
        found = [l for l in leads if l.get("external_id") == ext]
        assert found, "tradeindia lead not found"
        assert found[0]["source"] == "tradeindia"


# ----------------- PDFs -----------------
class TestPDFs:
    @pytest.fixture(scope="class")
    def docs(self, admin):
        # Create customer + invoice + quotation + supplier + PO for PDF generation
        c = admin.post(f"{API}/customers", json={"name": "TEST_PDF_Cust", "phone": "9", "gstin": "27AAAA0000A1Z5"})
        assert c.status_code == 200, c.text
        cid = c.json()["id"]; cname = c.json()["name"]

        inv = admin.post(f"{API}/invoices", json={
            "customer_id": cid, "customer_name": cname, "is_interstate": False,
            "lines": [{"description": "Item", "qty": 1, "rate": 100, "gst_rate": 18}]
        })
        assert inv.status_code == 200, inv.text

        qt = admin.post(f"{API}/quotations", json={
            "customer_id": cid, "customer_name": cname,
            "lines": [{"description": "Quote Item", "qty": 1, "rate": 200, "gst_rate": 18}]
        })
        assert qt.status_code == 200, qt.text

        sup = admin.post(f"{API}/suppliers", json={"name": "TEST_PDF_Sup", "phone": "1"})
        assert sup.status_code == 200, sup.text
        po = admin.post(f"{API}/purchase-orders", json={
            "supplier_id": sup.json()["id"], "supplier_name": sup.json()["name"],
            "lines": [{"description": "PO Item", "qty": 2, "rate": 50, "gst_rate": 18}]
        })
        assert po.status_code == 200, po.text
        return {"inv_id": inv.json()["id"], "qt_id": qt.json()["id"], "po_id": po.json()["id"]}

    def _assert_pdf(self, r):
        assert r.status_code == 200, r.text[:300]
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct, f"content-type={ct}"
        assert r.content[:4] == b"%PDF", f"first bytes={r.content[:8]!r}"

    def test_invoice_pdf(self, admin, docs):
        r = admin.get(f"{API}/invoices/{docs['inv_id']}/pdf")
        self._assert_pdf(r)

    def test_quotation_pdf(self, admin, docs):
        r = admin.get(f"{API}/quotations/{docs['qt_id']}/pdf")
        self._assert_pdf(r)

    def test_po_pdf(self, admin, docs):
        r = admin.get(f"{API}/purchase-orders/{docs['po_id']}/pdf")
        self._assert_pdf(r)


# ----------------- GSTR CSVs -----------------
class TestGSTRCsv:
    def test_gstr1_csv(self, admin):
        r = admin.get(f"{API}/accounting/gstr1.csv")
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        body = r.text
        first_line = body.splitlines()[0]
        # check header row
        assert "Invoice Number" in first_line
        assert "Taxable Value" in first_line

    def test_gstr3b_csv(self, admin):
        r = admin.get(f"{API}/accounting/gstr3b.csv")
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        body = r.text
        assert "GSTR-3B Summary" in body
        assert "Net GST Payable" in body


# ----------------- 2FA TOTP flow -----------------
class TestTotp2FA:
    """Runs sequentially: setup -> enable -> login-with-totp -> disable."""

    def test_status_initially_disabled(self, admin):
        r = admin.get(f"{API}/auth/2fa/status")
        assert r.status_code == 200, r.text
        assert r.json()["enabled"] is False

    def test_setup_returns_secret_and_uri(self, admin):
        r = admin.post(f"{API}/auth/2fa/setup", json={})
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("secret"), str) and len(d["secret"]) >= 16
        assert "otpauth://" in d.get("otpauth_url", "")
        pytest._totp_secret = d["secret"]  # type: ignore[attr-defined]

    def test_enable_wrong_code_rejected(self, admin):
        r = admin.post(f"{API}/auth/2fa/enable", json={"code": "000000"})
        assert r.status_code == 400, r.text

    def test_enable_correct_code(self, admin):
        secret = pytest._totp_secret  # type: ignore[attr-defined]
        code = pyotp.TOTP(secret).now()
        r = admin.post(f"{API}/auth/2fa/enable", json={"code": code})
        assert r.status_code == 200, r.text
        # status should now be enabled
        st = admin.get(f"{API}/auth/2fa/status").json()
        assert st["enabled"] is True

    def test_login_without_totp_blocked(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert r.status_code == 401, r.text
        # Body should reflect TOTP required
        assert "TOTP" in r.text or "totp" in r.text.lower()

    def test_login_with_totp_succeeds(self):
        secret = pytest._totp_secret  # type: ignore[attr-defined]
        code = pyotp.TOTP(secret).now()
        r = _login(ADMIN_EMAIL, ADMIN_PASS, totp_code=code)
        assert r.status_code == 200, r.text
        assert "token" in r.json()

    def test_disable_2fa(self, admin):
        secret = pytest._totp_secret  # type: ignore[attr-defined]
        code = pyotp.TOTP(secret).now()
        r = admin.post(f"{API}/auth/2fa/disable", json={"code": code})
        assert r.status_code == 200, r.text
        # status disabled
        st = admin.get(f"{API}/auth/2fa/status").json()
        assert st["enabled"] is False
        # and plain login works again
        lr = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert lr.status_code == 200, lr.text


# ----------------- Audit log -----------------
class TestAuditLog:
    def test_audit_admin_lists_2fa_events(self, admin):
        r = admin.get(f"{API}/audit-logs")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        actions = {row.get("action") for row in rows}
        # 2FA enable/disable events should be present after TestTotp2FA ran
        assert "2fa_enable" in actions, f"actions={actions}"
        assert "2fa_disable" in actions, f"actions={actions}"

    def test_audit_non_admin_forbidden(self, non_admin):
        r = non_admin.get(f"{API}/audit-logs")
        assert r.status_code == 403, r.text


# ----------------- Regression sanity -----------------
class TestRegression:
    def test_dashboard_stats(self, admin):
        r = admin.get(f"{API}/dashboard/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("open_wo", "qc_pending", "low_stock_count", "customers", "revenue"):
            assert k in d

    def test_customers_list(self, admin):
        r = admin.get(f"{API}/customers")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_inventory_movement(self, admin):
        sku = f"TEST-SKU-P2-{int(time.time())}"
        item = admin.post(f"{API}/inventory/items", json={
            "sku": sku, "name": "TEST_P2_Item", "qty_on_hand": 0,
            "reorder_level": 1, "unit_cost": 1
        })
        assert item.status_code == 200, item.text
        iid = item.json()["id"]
        mv = admin.post(f"{API}/inventory/movements", json={
            "item_id": iid, "item_sku": "", "item_name": "", "type": "in", "qty": 7
        })
        assert mv.status_code == 200, mv.text
        items = admin.get(f"{API}/inventory/items").json()
        cur = next(x for x in items if x["id"] == iid)
        assert cur["qty_on_hand"] == 7

    def test_portal_track_404_public(self):
        r = requests.get(f"{API}/portal/track", params={"ref": "NOPE-P2"}, timeout=15)
        assert r.status_code == 404
