"""
Denplex ERP — backend tests for:
- Auth + regression
- Settings integrations (new google_* fields, company_tagline)
- Google OAuth scaffolding (status / auth-url / error-paths without real OAuth)
- Generic IMAP/SMTP per-user email account
- Branded PDF endpoints (size > 30KB, application/pdf header)

NOTE: Google APIs and IMAP/SMTP servers are NOT called for real. Only the
configured/not-configured + auth_url-generation branches are exercised.
"""
import os
import time
import urllib.parse as up
from typing import Any, Dict, Optional

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
    tok = r.json().get("token")
    assert tok and isinstance(tok, str) and len(tok) > 10
    return tok


@pytest.fixture(scope="module")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def _clean_state(admin):
    """Start clean: no google creds, no email_account, integration settings cleared of google fields."""
    # delete email account (idempotent)
    admin.delete(f"{API}/integrations/email-account")
    # disconnect google (idempotent — endpoint is always ok)
    admin.post(f"{API}/integrations/google/disconnect")
    # clear google settings
    cur = admin.get(f"{API}/settings/integrations").json() or {}
    cur.update({
        "google_client_id": "",
        "google_client_secret": "",
        "google_redirect_uri": "",
        "google_drive_folder_id": "",
    })
    admin.put(f"{API}/settings/integrations", json=cur)
    yield
    # final cleanup
    admin.delete(f"{API}/integrations/email-account")
    admin.post(f"{API}/integrations/google/disconnect")


# ----------------- Auth + Regression -----------------
class TestAuthAndRegression:
    def test_admin_login_returns_jwt(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str)
        # JWT has three dot-separated segments
        assert data["token"].count(".") == 2

    def test_dashboard_stats(self, admin):
        r = admin.get(f"{API}/dashboard/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict)

    def test_customers_list(self, admin):
        r = admin.get(f"{API}/customers")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_invoices_list(self, admin):
        r = admin.get(f"{API}/invoices")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_inventory_items_list(self, admin):
        r = admin.get(f"{API}/inventory/items")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ----------------- Settings Integrations (new fields) -----------------
class TestSettingsIntegrationsNewFields:
    def test_get_requires_admin(self, admin):
        r = admin.get(f"{API}/settings/integrations")
        assert r.status_code == 200, r.text

    def test_non_admin_forbidden(self, admin):
        # create transient sales user
        email = f"test_sales_denplex_{int(time.time())}@erp.com"
        cr = admin.post(f"{API}/auth/register", json={
            "name": "TEST_Sales_Denplex", "email": email, "password": "Sales@123", "role": "sales"
        })
        assert cr.status_code == 200, cr.text
        lr = _login(email, "Sales@123")
        assert lr.status_code == 200, lr.text
        tok = lr.json()["token"]
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        rg = s.get(f"{API}/settings/integrations")
        assert rg.status_code == 403, rg.text
        rp = s.put(f"{API}/settings/integrations", json={})
        assert rp.status_code == 403, rp.text

    def test_put_persists_google_and_tagline_fields(self, admin):
        cur = admin.get(f"{API}/settings/integrations").json() or {}
        cur.update({
            "google_client_id": "test-id",
            "google_client_secret": "test-secret",
            "google_redirect_uri": "https://example.com/api/integrations/google/callback",
            "google_drive_folder_id": "FOLDER_TEST_123",
            "company_tagline": "TEST_TAGLINE_Denplex",
        })
        u = admin.put(f"{API}/settings/integrations", json=cur)
        assert u.status_code == 200, u.text

        g = admin.get(f"{API}/settings/integrations").json()
        assert g["google_client_id"] == "test-id"
        assert g["google_client_secret"] == "test-secret"
        assert g["google_redirect_uri"] == "https://example.com/api/integrations/google/callback"
        assert g["google_drive_folder_id"] == "FOLDER_TEST_123"
        assert g["company_tagline"] == "TEST_TAGLINE_Denplex"


# ----------------- Google OAuth scaffolding -----------------
class TestGoogleOAuth:
    def _clear_google_settings(self, admin):
        cur = admin.get(f"{API}/settings/integrations").json() or {}
        cur.update({
            "google_client_id": "",
            "google_client_secret": "",
            "google_redirect_uri": "",
        })
        r = admin.put(f"{API}/settings/integrations", json=cur)
        assert r.status_code == 200

    def _set_google_settings(self, admin):
        cur = admin.get(f"{API}/settings/integrations").json() or {}
        cur.update({
            "google_client_id": "test-id",
            "google_client_secret": "test-secret",
            "google_redirect_uri": "https://example.com/api/integrations/google/callback",
        })
        r = admin.put(f"{API}/settings/integrations", json=cur)
        assert r.status_code == 200

    def test_status_not_connected_initially(self, admin):
        r = admin.get(f"{API}/integrations/google/status")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("connected") is False
        assert "email" in d  # field present even if empty

    def test_auth_url_400_when_not_configured(self, admin):
        self._clear_google_settings(admin)
        r = admin.get(f"{API}/integrations/google/auth-url")
        assert r.status_code == 400, r.text
        assert "not configured" in r.text.lower()

    def test_auth_url_returns_google_url_with_scopes(self, admin):
        self._set_google_settings(admin)
        r = admin.get(f"{API}/integrations/google/auth-url")
        assert r.status_code == 200, r.text
        d = r.json()
        url = d.get("auth_url", "")
        assert "accounts.google.com" in url, f"url={url}"
        parsed = up.urlparse(url)
        qs = up.parse_qs(parsed.query)
        # client_id passed through
        assert qs.get("client_id", [""])[0] == "test-id"
        # redirect_uri matches what we set
        assert qs.get("redirect_uri", [""])[0] == "https://example.com/api/integrations/google/callback"
        # scopes contain drive.file, gmail.send, gmail.readonly
        scope_str = qs.get("scope", [""])[0]
        assert "drive.file" in scope_str, f"scope={scope_str}"
        assert "gmail.send" in scope_str, f"scope={scope_str}"
        assert "gmail.readonly" in scope_str, f"scope={scope_str}"

    def test_drive_upload_400_when_not_connected(self, admin):
        # send valid base64 of trivial payload — should fail on "not connected" first
        r = admin.post(f"{API}/integrations/google/drive/upload", json={
            "filename": "TEST_x.pdf", "mime": "application/pdf",
            "file_base64": "JVBERi0xLjQK",  # "%PDF-1.4\n"
        })
        assert r.status_code == 400, r.text
        assert "not connected" in r.text.lower()

    def test_gmail_send_400_when_not_connected(self, admin):
        r = admin.post(f"{API}/integrations/google/gmail/send", json={
            "to": ["someone@example.com"], "subject": "s", "html": "<p>h</p>",
        })
        assert r.status_code == 400, r.text
        assert "not connected" in r.text.lower()

    def test_gmail_sync_leads_400_when_not_connected(self, admin):
        r = admin.post(f"{API}/integrations/google/gmail/sync-leads")
        assert r.status_code == 400, r.text
        assert "not connected" in r.text.lower()

    def test_drive_backup_doc_400_when_not_connected(self, admin):
        # Create a real invoice first; backup endpoint loads doc before checking google creds
        c = admin.post(f"{API}/customers", json={"name": "TEST_DriveBak_Cust", "phone": "9"})
        assert c.status_code == 200, c.text
        inv = admin.post(f"{API}/invoices", json={
            "customer_id": c.json()["id"], "customer_name": c.json()["name"],
            "is_interstate": False,
            "lines": [{"description": "x", "qty": 1, "rate": 10, "gst_rate": 18}],
        })
        assert inv.status_code == 200, inv.text
        iid = inv.json()["id"]
        r = admin.post(f"{API}/integrations/google/drive/backup-doc/invoices/{iid}")
        assert r.status_code == 400, r.text
        assert "not connected" in r.text.lower()

    def test_disconnect_always_ok(self, admin):
        # Even with no google block on user, the endpoint should return ok
        r = admin.post(f"{API}/integrations/google/disconnect")
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # Calling twice still ok
        r2 = admin.post(f"{API}/integrations/google/disconnect")
        assert r2.status_code == 200, r2.text
        assert r2.json().get("ok") is True

    def test_callback_requires_code_and_state(self, admin):
        # Missing both -> FastAPI returns 422 from Query(...) validation
        r = requests.get(f"{API}/integrations/google/callback", timeout=15)
        assert r.status_code in (400, 422), r.text

    def test_callback_invalid_state_returns_400(self, admin):
        r = requests.get(
            f"{API}/integrations/google/callback",
            params={"code": "FAKE_CODE", "state": "NOT_A_REAL_STATE_xyz"},
            timeout=15,
            allow_redirects=False,
        )
        assert r.status_code == 400, r.text
        assert "invalid state" in r.text.lower()


# ----------------- Email account (per-user IMAP/SMTP) -----------------
class TestEmailAccount:
    def test_get_initial_no_password(self, admin):
        # ensure clean (autouse may have changed during google tests' run-order)
        admin.delete(f"{API}/integrations/email-account")
        r = admin.get(f"{API}/integrations/email-account")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("has_smtp_password") is False
        assert "smtp_password" not in d
        assert "imap_password" not in d

    def test_smtp_send_400_when_not_configured(self, admin):
        admin.delete(f"{API}/integrations/email-account")
        r = admin.post(f"{API}/integrations/smtp/send", json={
            "to": ["someone@example.com"], "subject": "s", "html": "<p>h</p>",
        })
        assert r.status_code == 400, r.text
        assert "not configured" in r.text.lower()

    def test_imap_sync_leads_400_when_not_configured(self, admin):
        admin.delete(f"{API}/integrations/email-account")
        r = admin.post(f"{API}/integrations/imap/sync-leads")
        assert r.status_code == 400, r.text
        assert "not configured" in r.text.lower()

    def test_put_email_account_and_password_not_leaked(self, admin):
        payload = {
            "display_name": "TEST Account",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_use_tls": True,
            "smtp_user": "TEST_user@example.com",
            "smtp_password": "TEST_SUPER_SECRET_PW",
            "imap_host": "imap.example.com",
            "imap_port": 993,
            "imap_user": "TEST_user@example.com",
            "imap_password": "TEST_IMAP_SECRET",
            "from_email": "TEST_user@example.com",
        }
        r = admin.put(f"{API}/integrations/email-account", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # GET back must not leak passwords
        g = admin.get(f"{API}/integrations/email-account")
        assert g.status_code == 200, g.text
        d = g.json()
        assert d.get("has_smtp_password") is True
        assert d.get("has_imap_password") is True
        assert "smtp_password" not in d
        assert "imap_password" not in d
        # critical: ensure raw secret is nowhere in response body
        assert "TEST_SUPER_SECRET_PW" not in g.text
        assert "TEST_IMAP_SECRET" not in g.text
        # non-secret values returned for UX
        assert d.get("smtp_host") == "smtp.example.com"
        assert d.get("imap_host") == "imap.example.com"
        assert d.get("from_email") == "TEST_user@example.com"

    def test_delete_email_account_clears(self, admin):
        # ensure something is set
        admin.put(f"{API}/integrations/email-account", json={
            "display_name": "x", "smtp_host": "smtp.example.com", "smtp_port": 587,
            "smtp_use_tls": True, "smtp_user": "u@example.com",
            "smtp_password": "TEST_PW_X", "imap_host": "imap.example.com",
            "imap_port": 993, "from_email": "u@example.com",
        })
        r = admin.delete(f"{API}/integrations/email-account")
        assert r.status_code == 200, r.text
        g = admin.get(f"{API}/integrations/email-account").json()
        assert g.get("has_smtp_password") is False
        assert "smtp_password" not in g


# ----------------- Branded PDFs -----------------
class TestBrandedPDFs:
    @pytest.fixture(scope="class")
    def docs(self, admin):
        # Ensure company tagline + name present so branding renders
        cur = admin.get(f"{API}/settings/integrations").json() or {}
        cur.update({
            "company_name": "Denplex Engineering Company",
            "company_tagline": "Precision Engineered Solutions",
            "company_gstin": "27AAAA0000A1Z5",
            "company_state": "MH",
            "company_address": "TEST_ADDR, Pune, MH",
        })
        admin.put(f"{API}/settings/integrations", json=cur)

        c = admin.post(f"{API}/customers", json={
            "name": "TEST_PDF_Cust_Denplex", "phone": "9", "gstin": "27AAAA0000A1Z5"
        })
        assert c.status_code == 200, c.text
        cid = c.json()["id"]; cname = c.json()["name"]

        inv = admin.post(f"{API}/invoices", json={
            "customer_id": cid, "customer_name": cname, "is_interstate": False,
            "lines": [
                {"description": "Bracket-A", "qty": 5, "rate": 250, "gst_rate": 18},
                {"description": "Bracket-B", "qty": 3, "rate": 400, "gst_rate": 18},
            ],
        })
        assert inv.status_code == 200, inv.text
        qt = admin.post(f"{API}/quotations", json={
            "customer_id": cid, "customer_name": cname,
            "lines": [{"description": "Q Item", "qty": 2, "rate": 333, "gst_rate": 18}],
        })
        assert qt.status_code == 200, qt.text
        sup = admin.post(f"{API}/suppliers", json={"name": "TEST_PDF_Sup_Denplex", "phone": "1"})
        assert sup.status_code == 200, sup.text
        po = admin.post(f"{API}/purchase-orders", json={
            "supplier_id": sup.json()["id"], "supplier_name": sup.json()["name"],
            "lines": [{"description": "PO Item", "qty": 4, "rate": 75, "gst_rate": 18}],
        })
        assert po.status_code == 200, po.text
        return {"inv_id": inv.json()["id"], "qt_id": qt.json()["id"], "po_id": po.json()["id"]}

    def _assert_branded_pdf(self, r, *, min_size: int = 30 * 1024):
        assert r.status_code == 200, r.text[:300]
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct, f"content-type={ct}"
        assert r.content[:4] == b"%PDF", f"first bytes={r.content[:8]!r}"
        # logo embedded -> PDF should be reasonably large
        assert len(r.content) > min_size, f"pdf size {len(r.content)} <= {min_size}"

    def test_invoice_pdf_branded(self, admin, docs):
        r = admin.get(f"{API}/invoices/{docs['inv_id']}/pdf")
        self._assert_branded_pdf(r)

    def test_quotation_pdf_branded(self, admin, docs):
        r = admin.get(f"{API}/quotations/{docs['qt_id']}/pdf")
        self._assert_branded_pdf(r)

    def test_po_pdf_branded(self, admin, docs):
        r = admin.get(f"{API}/purchase-orders/{docs['po_id']}/pdf")
        self._assert_branded_pdf(r)
