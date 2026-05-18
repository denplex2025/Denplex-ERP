import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card } from "@/components/erp/Primitives";
import { Save, Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [tab, setTab] = useState("company");
  const [s, setS] = useState({});
  const [twoFa, setTwoFa] = useState({ enabled: false });
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");

  const load = async () => {
    try {
      const r = await api.get("/settings/integrations"); setS(r.data || {});
      const t = await api.get("/auth/2fa/status"); setTwoFa(t.data);
    } catch (e) { toast.error("Admin only"); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try { await api.put("/settings/integrations", s); toast.success("Saved"); load(); }
    catch (e) { toast.error("Failed"); }
  };
  const setF = (k, v) => setS(p => ({ ...p, [k]: v }));

  const setup2fa = async () => {
    try { const r = await api.post("/auth/2fa/setup"); setSetup(r.data); setSetupOpen(true); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const enable2fa = async () => {
    try { await api.post("/auth/2fa/enable", { code }); toast.success("2FA enabled"); setSetupOpen(false); setCode(""); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Invalid code"); }
  };
  const disable2fa = async () => {
    const c = window.prompt("Enter current 6-digit code from your authenticator to disable 2FA"); if (!c) return;
    try { await api.post("/auth/2fa/disable", { code: c }); toast.success("2FA disabled"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const webhookUrl = `${window.location.origin}/api/integrations/tradeindia/webhook?token=${s.tradeindia_webhook_secret || "<set-secret-first>"}`;
  const copy = (text) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  return (
    <div data-testid="settings-page">
      <PageHeader overline="Administration" title="Settings & Integrations" subtitle="Configure company details, Twilio WhatsApp, Resend email, Indiamart, TradeIndia, and your 2FA." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100 mb-4 flex-wrap h-auto">
          <TabsTrigger value="company" className="rounded-sm" data-testid="tab-company">Company</TabsTrigger>
          <TabsTrigger value="google" className="rounded-sm" data-testid="tab-google">Google (Drive + Gmail)</TabsTrigger>
          <TabsTrigger value="email" className="rounded-sm" data-testid="tab-email">Email Account (IMAP/SMTP)</TabsTrigger>
          <TabsTrigger value="twilio" className="rounded-sm" data-testid="tab-twilio">Twilio WhatsApp</TabsTrigger>
          <TabsTrigger value="resend" className="rounded-sm" data-testid="tab-resend">Resend Email</TabsTrigger>
          <TabsTrigger value="indiamart" className="rounded-sm" data-testid="tab-indiamart">Indiamart</TabsTrigger>
          <TabsTrigger value="tradeindia" className="rounded-sm" data-testid="tab-tradeindia">TradeIndia</TabsTrigger>
          <TabsTrigger value="2fa" className="rounded-sm" data-testid="tab-2fa">Security & 2FA</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Company Name"><Input value={s.company_name || ""} onChange={e=>setF("company_name", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Tagline"><Input value={s.company_tagline || ""} onChange={e=>setF("company_tagline", e.target.value)} className="rounded-sm" placeholder="Precision Engineered Solutions" /></Fld>
              <Fld label="Company GSTIN"><Input value={s.company_gstin || ""} onChange={e=>setF("company_gstin", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="State"><Input value={s.company_state || ""} onChange={e=>setF("company_state", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Address"><Textarea rows={3} value={s.company_address || ""} onChange={e=>setF("company_address", e.target.value)} className="rounded-sm" /></Fld>
            </div>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-company"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="google">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Configure OAuth in <a className="text-red-600 underline" target="_blank" rel="noreferrer" href="https://console.cloud.google.com/apis/credentials">Google Cloud Console</a>. Enable <strong>Drive API</strong> and <strong>Gmail API</strong>. Add this Redirect URI: <code className="bg-slate-100 px-1 text-xs">{`${window.location.origin}/api/integrations/google/callback`}</code></p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Google Client ID"><Input value={s.google_client_id || ""} onChange={e=>setF("google_client_id", e.target.value)} className="rounded-sm font-mono-tech" data-testid="g-client-id" /></Fld>
              <Fld label="Google Client Secret"><Input type="password" value={s.google_client_secret || ""} onChange={e=>setF("google_client_secret", e.target.value)} className="rounded-sm font-mono-tech" data-testid="g-client-secret" /></Fld>
              <Fld label="Redirect URI"><Input value={s.google_redirect_uri || `${window.location.origin}/api/integrations/google/callback`} onChange={e=>setF("google_redirect_uri", e.target.value)} className="rounded-sm font-mono-tech" data-testid="g-redirect" /></Fld>
              <Fld label="Drive folder ID (optional, for backups)"><Input value={s.google_drive_folder_id || ""} onChange={e=>setF("google_drive_folder_id", e.target.value)} className="rounded-sm font-mono-tech" placeholder="root if blank" /></Fld>
            </div>
            <div className="mt-4 flex gap-2 items-center">
              <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-google"><Save className="h-4 w-4 mr-1" /> Save</Button>
              <GoogleConnectBlock />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <EmailAccountTab />
        </TabsContent>

        <TabsContent value="twilio">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Get credentials from <a className="text-red-600 underline" target="_blank" rel="noreferrer" href="https://console.twilio.com/">Twilio Console</a>. For sandbox use <code className="bg-slate-100 px-1">whatsapp:+14155238886</code>.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Account SID"><Input value={s.twilio_account_sid || ""} onChange={e=>setF("twilio_account_sid", e.target.value)} className="rounded-sm font-mono-tech" data-testid="twilio-sid" /></Fld>
              <Fld label="Auth Token"><Input type="password" value={s.twilio_auth_token || ""} onChange={e=>setF("twilio_auth_token", e.target.value)} className="rounded-sm font-mono-tech" data-testid="twilio-token" /></Fld>
              <Fld label="From WhatsApp number"><Input value={s.twilio_whatsapp_from || ""} onChange={e=>setF("twilio_whatsapp_from", e.target.value)} placeholder="whatsapp:+14155238886" className="rounded-sm font-mono-tech" data-testid="twilio-from" /></Fld>
            </div>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-twilio"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="resend">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Get an API key from <a className="text-red-600 underline" target="_blank" rel="noreferrer" href="https://resend.com/api-keys">Resend dashboard</a>. Verify your sender domain to send to any recipient.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Resend API Key"><Input type="password" value={s.resend_api_key || ""} onChange={e=>setF("resend_api_key", e.target.value)} placeholder="re_xxxxxxxxxxxx" className="rounded-sm font-mono-tech" data-testid="resend-key" /></Fld>
              <Fld label="From Email"><Input value={s.resend_from_email || ""} onChange={e=>setF("resend_from_email", e.target.value)} placeholder="noreply@yourdomain.com" className="rounded-sm" data-testid="resend-from" /></Fld>
            </div>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-resend"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="indiamart">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Get your <strong>glusr_crm_key</strong> from Indiamart Seller Panel → Lead Manager → API. Pulls the last 7 days of leads by default.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Indiamart CRM Key"><Input type="password" value={s.indiamart_crm_key || ""} onChange={e=>setF("indiamart_crm_key", e.target.value)} className="rounded-sm font-mono-tech" data-testid="indiamart-key" /></Fld>
            </div>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-indiamart"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="tradeindia">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Set a secret token below, then paste this webhook URL in your TradeIndia "Lead Webhook" settings. Each lead POSTed will be auto-added.</p>
            <Fld label="Webhook Secret Token (your choice)">
              <Input value={s.tradeindia_webhook_secret || ""} onChange={e=>setF("tradeindia_webhook_secret", e.target.value)} placeholder="long-random-string" className="rounded-sm font-mono-tech" data-testid="ti-secret" />
            </Fld>
            <div className="mt-3"><Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-tradeindia"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
            <div className="mt-5 border border-slate-200 p-3 bg-slate-50">
              <div className="text-xs uppercase tracking-wider text-slate-600 mb-1">Your webhook URL</div>
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono-tech text-slate-700 break-all">{webhookUrl}</code>
                <Button size="sm" variant="outline" className="rounded-sm" onClick={()=>copy(webhookUrl)}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
              </div>
              <p className="text-xs text-slate-500 mt-2">Accepts JSON: {`{ name, company, phone, email, product, message, city, state, external_id }`}</p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="2fa">
          <Card className="p-6 mb-4">
            <h3 className="font-display text-lg font-semibold mb-2">Change password</h3>
            <p className="text-sm text-slate-600 mb-4">Strongly recommended for the seeded owner account.</p>
            <ChangePasswordForm />
          </Card>
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold mb-2">Two-factor authentication (TOTP)</h3>
            <p className="text-sm text-slate-600 mb-4">Use Google Authenticator, Authy, or any TOTP app. Once enabled, you'll be asked for a 6-digit code on every login.</p>
            {twoFa.enabled ? (
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 text-emerald-700"><ShieldCheck className="h-4 w-4" /> Enabled</div>
                <Button onClick={disable2fa} variant="outline" className="rounded-sm border-red-300 text-red-700 hover:bg-red-50" data-testid="disable-2fa"><ShieldOff className="h-4 w-4 mr-1" /> Disable</Button>
              </div>
            ) : (
              <Button onClick={setup2fa} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="setup-2fa"><ShieldCheck className="h-4 w-4 mr-1" /> Enable 2FA</Button>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display">Enable 2FA</DialogTitle></DialogHeader>
          {setup && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Add this secret to your authenticator app, then enter the 6-digit code below.</p>
              <div className="border border-slate-200 p-3 bg-slate-50">
                <div className="text-xs uppercase tracking-wider text-slate-500">Secret</div>
                <div className="font-mono-tech text-sm break-all" data-testid="2fa-secret">{setup.secret}</div>
              </div>
              <a href={setup.otpauth_url} className="text-xs text-red-600 underline" target="_blank" rel="noreferrer">Open in authenticator (mobile)</a>
              <div>
                <Label className="text-xs uppercase">6-digit code</Label>
                <Input value={code} onChange={e=>setCode(e.target.value)} className="rounded-sm font-mono-tech mt-1.5" data-testid="2fa-code" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setSetupOpen(false)}>Cancel</Button>
            <Button onClick={enable2fa} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="enable-2fa">Enable</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Fld = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);

function GoogleConnectBlock() {
  const [status, setStatus] = useState(null);
  const load = async () => { try { const r = await api.get("/integrations/google/status"); setStatus(r.data); } catch (e) {} };
  useEffect(() => { load(); }, []);
  const connect = async () => {
    try {
      const r = await api.get("/integrations/google/auth-url");
      window.location.href = r.data.auth_url;
    } catch (e) { toast.error(e?.response?.data?.detail || "Save OAuth config first"); }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect your Google account?")) return;
    await api.post("/integrations/google/disconnect"); load(); toast.success("Disconnected");
  };
  if (!status) return null;
  return status.connected ? (
    <div className="flex items-center gap-3 text-sm">
      <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-4 w-4" /> Connected as <code className="font-mono-tech">{status.email}</code></span>
      <Button onClick={disconnect} variant="outline" className="rounded-sm border-red-300 text-red-700 hover:bg-red-50" data-testid="disconnect-google">Disconnect</Button>
    </div>
  ) : (
    <Button onClick={connect} className="rounded-sm bg-black hover:bg-slate-800" data-testid="connect-google">Connect Google account</Button>
  );
}

function EmailAccountTab() {
  const [a, setA] = useState({ smtp_port: 587, imap_port: 993, smtp_use_tls: true });
  const [has, setHas] = useState({ has_smtp_password: false, has_imap_password: false });
  const load = async () => { try { const r = await api.get("/integrations/email-account"); setA(p => ({ ...p, ...r.data })); setHas(r.data); } catch (e) {} };
  useEffect(() => { load(); }, []);
  const setF = (k, v) => setA(p => ({ ...p, [k]: v }));
  const save = async () => {
    try { await api.put("/integrations/email-account", a); toast.success("Email account saved"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async () => { if (!window.confirm("Remove email account?")) return; await api.delete("/integrations/email-account"); setA({ smtp_port: 587, imap_port: 993, smtp_use_tls: true }); toast.success("Removed"); };
  return (
    <Card className="p-6" data-testid="email-account-card">
      <p className="text-sm text-slate-600 mb-3">Connect any Outlook / Zoho / iCloud / custom IMAP+SMTP account to send invoices/quotes from your own mailbox and to import inquiry emails as leads. Credentials are stored only for your user.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Fld label="Display name (optional)"><Input value={a.display_name || ""} onChange={e=>setF("display_name", e.target.value)} className="rounded-sm" /></Fld>
        <Fld label="From email *"><Input value={a.from_email || ""} onChange={e=>setF("from_email", e.target.value)} className="rounded-sm" data-testid="email-from" /></Fld>
        <Fld label="SMTP host *"><Input value={a.smtp_host || ""} onChange={e=>setF("smtp_host", e.target.value)} className="rounded-sm font-mono-tech" placeholder="smtp.office365.com" data-testid="smtp-host" /></Fld>
        <Fld label="SMTP port"><Input type="number" value={a.smtp_port || 587} onChange={e=>setF("smtp_port", Number(e.target.value))} className="rounded-sm font-mono-tech" /></Fld>
        <Fld label="SMTP user *"><Input value={a.smtp_user || ""} onChange={e=>setF("smtp_user", e.target.value)} className="rounded-sm" data-testid="smtp-user" /></Fld>
        <Fld label="SMTP password *"><Input type="password" placeholder={has.has_smtp_password ? "•••••• (saved — type to change)" : ""} value={a.smtp_password || ""} onChange={e=>setF("smtp_password", e.target.value)} className="rounded-sm font-mono-tech" data-testid="smtp-pass" /></Fld>
        <Fld label="IMAP host *"><Input value={a.imap_host || ""} onChange={e=>setF("imap_host", e.target.value)} className="rounded-sm font-mono-tech" placeholder="imap.office365.com" data-testid="imap-host" /></Fld>
        <Fld label="IMAP port"><Input type="number" value={a.imap_port || 993} onChange={e=>setF("imap_port", Number(e.target.value))} className="rounded-sm font-mono-tech" /></Fld>
        <Fld label="IMAP user (defaults to SMTP user)"><Input value={a.imap_user || ""} onChange={e=>setF("imap_user", e.target.value)} className="rounded-sm" /></Fld>
        <Fld label="IMAP password (defaults to SMTP password)"><Input type="password" placeholder={has.has_imap_password ? "•••••• (saved)" : ""} value={a.imap_password || ""} onChange={e=>setF("imap_password", e.target.value)} className="rounded-sm font-mono-tech" /></Fld>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-email-account"><Save className="h-4 w-4 mr-1" /> Save</Button>
        {has.has_smtp_password && <Button variant="outline" className="rounded-sm border-red-300 text-red-700 hover:bg-red-50" onClick={del}>Remove</Button>}
      </div>
    </Card>
  );
}

function ChangePasswordForm() {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (nw !== confirm) { toast.error("New passwords don't match"); return; }
    if (nw.length < 8) { toast.error("Min 8 characters"); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: nw });
      toast.success("Password changed");
      setCur(""); setNw(""); setConfirm("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl" data-testid="change-password-form">
      <Fld label="Current password"><Input type="password" value={cur} onChange={e=>setCur(e.target.value)} required className="rounded-sm" data-testid="cur-pw" /></Fld>
      <Fld label="New password"><Input type="password" value={nw} onChange={e=>setNw(e.target.value)} required className="rounded-sm" data-testid="new-pw" /></Fld>
      <Fld label="Confirm new password"><Input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required className="rounded-sm" data-testid="confirm-pw" /></Fld>
      <div className="md:col-span-3">
        <Button type="submit" disabled={loading} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-password">{loading ? "Saving..." : "Change password"}</Button>
      </div>
    </form>
  );
}

