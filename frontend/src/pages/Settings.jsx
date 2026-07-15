import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card } from "@/components/erp/Primitives";
import { Save, Copy, ShieldCheck, ShieldOff, Plus, Trash2, RefreshCw, Star, ExternalLink, Inbox, Upload, FileText, Eye, FileSpreadsheet, Database } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [tab, setTab] = useState("company");
  const [s, setS] = useState({});
  const [twoFa, setTwoFa] = useState({ enabled: false });
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [gdrive, setGdrive] = useState({ connected: false, configured: false, email: "", last_backup: "" });
  const [gdBusy, setGdBusy] = useState("");

  const load = async () => {
    try {
      const r = await api.get("/settings/integrations"); setS(r.data || {});
      const t = await api.get("/auth/2fa/status"); setTwoFa(t.data);
    } catch (e) { toast.error("Admin only"); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const refreshGd = () => api.get("/google/status", { silent: true }).then((r) => setGdrive(r.data)).catch(() => {});
    refreshGd();
    const params = new URLSearchParams(window.location.search);
    if (params.get("gdrive") === "connected") { toast.success("Google Drive connected"); refreshGd(); window.history.replaceState({}, "", "/app/settings"); setTab("gdrive"); }
    else if (params.get("gdrive") === "error") { toast.error("Google Drive connection failed — please try again"); window.history.replaceState({}, "", "/app/settings"); setTab("gdrive"); }
  }, []);

  const gdConnect = async () => {
    setGdBusy("connect");
    try { const r = await api.get("/google/oauth/start"); window.location.href = r.data.auth_url; }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not start Google connect"); setGdBusy(""); }
  };
  const gdDisconnect = async () => {
    if (!window.confirm("Disconnect Google Drive?")) return;
    setGdBusy("disc");
    try { await api.post("/google/disconnect"); setGdrive((g) => ({ ...g, connected: false, email: "" })); toast.success("Disconnected"); }
    catch (e) { toast.error("Failed to disconnect"); }
    setGdBusy("");
  };
  const gdBackup = async () => {
    setGdBusy("backup");
    try {
      const r = await api.post("/google/backup");
      toast.success(`Backup uploaded: ${r.data.file} (${r.data.size_kb} KB)`);
      api.get("/google/status", { silent: true }).then((x) => setGdrive(x.data)).catch(() => {});
    } catch (e) { toast.error(e?.response?.data?.detail || "Backup failed"); }
    setGdBusy("");
  };
  const gdToggleAuto = async (v) => {
    setGdrive((g) => ({ ...g, auto_backup: v }));
    try { await api.put("/google/auto-backup", { enabled: v, interval_hours: 24 }); toast.success(v ? "Automatic daily backup on" : "Automatic backup off"); }
    catch (e) { toast.error("Failed to update setting"); }
  };

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
      <PageHeader overline="Administration" title="Settings & Integrations" subtitle="Connect email mailboxes (Gmail/Outlook/Yahoo), Twilio WhatsApp, Indiamart/TradeIndia, customize your invoice template, and manage 2FA." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100 mb-4 flex-wrap h-auto">
          <TabsTrigger value="company" className="rounded-sm" data-testid="tab-company">Company</TabsTrigger>
          <TabsTrigger value="gdrive" className="rounded-sm" data-testid="tab-gdrive">Google Drive</TabsTrigger>
          <TabsTrigger value="template" className="rounded-sm" data-testid="tab-template">Invoice Template</TabsTrigger>
          <TabsTrigger value="email" className="rounded-sm" data-testid="tab-email">Email Accounts</TabsTrigger>
          <TabsTrigger value="vyapar" className="rounded-sm" data-testid="tab-vyapar">Vyapar Import</TabsTrigger>
          <TabsTrigger value="twilio" className="rounded-sm" data-testid="tab-twilio">Twilio WhatsApp</TabsTrigger>
          <TabsTrigger value="indiamart" className="rounded-sm" data-testid="tab-indiamart">Indiamart</TabsTrigger>
          <TabsTrigger value="tradeindia" className="rounded-sm" data-testid="tab-tradeindia">TradeIndia</TabsTrigger>
          <TabsTrigger value="2fa" className="rounded-sm" data-testid="tab-2fa">Security & 2FA</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold mb-4">Business identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Company Name"><Input value={s.company_name || ""} onChange={e=>setF("company_name", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Tagline"><Input value={s.company_tagline || ""} onChange={e=>setF("company_tagline", e.target.value)} className="rounded-sm" placeholder="Precision Engineered Solutions" /></Fld>
              <Fld label="Company GSTIN"><Input value={s.company_gstin || ""} onChange={e=>setF("company_gstin", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="State"><Input value={s.company_state || ""} onChange={e=>setF("company_state", e.target.value)} className="rounded-sm" placeholder="24-Gujarat" /></Fld>
              <Fld label="Phone"><Input value={s.company_phone || ""} onChange={e=>setF("company_phone", e.target.value)} className="rounded-sm" placeholder="9033338999" /></Fld>
              <Fld label="Email"><Input value={s.company_email || ""} onChange={e=>setF("company_email", e.target.value)} className="rounded-sm" placeholder="denplexengineering@gmail.com" /></Fld>
              <Fld label="UDYAM / MSME Registration"><Input value={s.company_udyam || ""} onChange={e=>setF("company_udyam", e.target.value)} className="rounded-sm" placeholder="UDYAM-GJ-09-0005351" /></Fld>
              <Fld label="Address (single — fallback if no units below)"><Textarea rows={3} value={s.company_address || ""} onChange={e=>setF("company_address", e.target.value)} className="rounded-sm" /></Fld>
            </div>

            <h3 className="font-display text-lg font-semibold mt-8 mb-2">Manufacturing units</h3>
            <p className="text-sm text-slate-600 mb-3">Add each unit/factory. The PDF header will render every unit listed here. If empty, falls back to the single address above.</p>
            <UnitsEditor units={s.company_units || []} onChange={(arr)=>setF("company_units", arr)} />

            <h3 className="font-display text-lg font-semibold mt-8 mb-4">Bank & UPI (for invoice footer)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Bank Name"><Input value={s.bank_name || ""} onChange={e=>setF("bank_name", e.target.value)} className="rounded-sm font-mono-tech" /></Fld>
              <Fld label="Bank Account No."><Input value={s.bank_account_no || ""} onChange={e=>setF("bank_account_no", e.target.value)} className="rounded-sm font-mono-tech" /></Fld>
              <Fld label="IFSC Code"><Input value={s.bank_ifsc || ""} onChange={e=>setF("bank_ifsc", e.target.value)} className="rounded-sm font-mono-tech" /></Fld>
              <Fld label="Branch"><Input value={s.bank_branch || ""} onChange={e=>setF("bank_branch", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="UPI ID (for auto QR)"><Input value={s.upi_id || ""} onChange={e=>setF("upi_id", e.target.value)} className="rounded-sm font-mono-tech" placeholder="denplex@axisbank" /></Fld>
            </div>

            <h3 className="font-display text-lg font-semibold mt-8 mb-4">Signature & defaults</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Signatory label"><Input value={s.signatory_label || "Authorised Signatory"} onChange={e=>setF("signatory_label", e.target.value)} className="rounded-sm" /></Fld>
              <SignatoryUpload value={s.signatory_image_b64 || ""} onChange={(v)=>setF("signatory_image_b64", v)} />
              <Fld label="Default Terms & Conditions (printed on every invoice)"><Textarea rows={3} value={s.invoice_terms || ""} onChange={e=>setF("invoice_terms", e.target.value)} className="rounded-sm" placeholder="Thanks for doing business with us!" /></Fld>
              <Fld label="Default Sale Description"><Textarea rows={3} value={s.invoice_description || ""} onChange={e=>setF("invoice_description", e.target.value)} className="rounded-sm" /></Fld>
            </div>
            <div className="mt-6"><Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-company"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="template">
          <InvoiceTemplatePanel />
        </TabsContent>

        <TabsContent value="vyapar">
          <VyaparImportPanel />
        </TabsContent>

        <TabsContent value="email">
          <EmailAccountsPanel />
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

        <TabsContent value="gdrive">
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold mb-1">Google Drive</h3>
            <p className="text-sm text-slate-600 mb-4">Connect your company Google Drive to store ERP files and back up your data. Files go to a “Denplex ERP” folder in your Drive.</p>
            {!gdrive.configured ? (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">Google sign-in isn’t configured on the server yet (GOOGLE_OAUTH_CLIENT_ID / SECRET).</div>
            ) : gdrive.connected ? (
              <>
                <div className="flex items-center gap-2 text-sm text-emerald-700 mb-4"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected{gdrive.email ? ` as ${gdrive.email}` : ""}</div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={gdBackup} disabled={!!gdBusy} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="gd-backup">{gdBusy === "backup" ? "Backing up…" : "Back up ERP data now"}</Button>
                  <Button onClick={gdDisconnect} disabled={!!gdBusy} variant="outline" className="rounded-sm" data-testid="gd-disconnect">Disconnect</Button>
                </div>
                <label className="flex items-center gap-2 mt-4 text-sm text-slate-700 cursor-pointer w-fit">
                  <Switch checked={gdrive.auto_backup !== false} onCheckedChange={gdToggleAuto} data-testid="gd-auto" /> Automatic daily backup
                </label>
                {gdrive.last_backup && <div className="text-xs text-slate-500 mt-3">Last backup: {new Date(gdrive.last_backup).toLocaleString()}</div>}
                <div className="text-xs text-slate-400 mt-2">Backups are saved to “Denplex ERP / Backups”. New part drawings &amp; STEP files are now stored on Drive automatically.</div>
              </>
            ) : (
              <Button onClick={gdConnect} disabled={!!gdBusy} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="gd-connect">{gdBusy === "connect" ? "Opening Google…" : "Connect Google Drive"}</Button>
            )}
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

function EmailAccountsPanel() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [inboxAcct, setInboxAcct] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/email/accounts"); setAccounts(r.data || []); }
    catch (e) { toast.error("Failed to load email accounts"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (a) => {
    if (!window.confirm(`Disconnect ${a.email}? You can re-add it any time.`)) return;
    try { await api.delete(`/email/accounts/${a.id}`); toast.success("Disconnected"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const test = async (a) => {
    try { const r = await api.post(`/email/accounts/${a.id}/test`); toast[r.data?.ok ? "success" : "error"](r.data?.ok ? "Connection OK" : (r.data?.error || "Failed")); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const makeDefault = async (a) => {
    try { await api.post(`/email/accounts/${a.id}/default`); toast.success(`Default → ${a.email}`); load(); }
    catch (e) { toast.error("Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="email-accounts-panel">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-semibold">Connected email mailboxes</h3>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">Connect your own Gmail / Outlook / Yahoo or a central company mailbox (e.g. sales@denplex.co). Each user can connect multiple accounts. The default account is used when sending quotations & invoices.</p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="add-email-account"><Plus className="h-4 w-4 mr-1" /> Add account</Button>
        </div>

        <div className="mt-5 border border-slate-200">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 text-center">No mailboxes connected yet. Click <strong>Add account</strong> to connect your first Gmail.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2">Email</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Default</th><th className="px-3 py-2">Last test</th><th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50" data-testid={`email-acct-row-${a.email}`}>
                    <td className="px-3 py-2 font-mono-tech">{a.email}</td>
                    <td className="px-3 py-2">{a.label}</td>
                    <td className="px-3 py-2">
                      {a.is_default ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs"><Star className="h-3 w-3 fill-emerald-700" /> Default</span>
                      ) : (
                        <Button size="sm" variant="outline" className="rounded-sm h-7 text-xs" onClick={()=>makeDefault(a)} data-testid={`make-default-${a.email}`}>Set default</Button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {a.last_test_ok
                        ? <span className="text-emerald-700">OK · {(a.last_test_at || "").slice(0,16).replace("T"," ")}</span>
                        : <span className="text-red-600" title={a.last_test_error}>Failed</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>test(a)} title="Re-test"><RefreshCw className="h-4 w-4 text-slate-700" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>setInboxAcct(a)} title="View inbox" data-testid={`view-inbox-${a.email}`}><Inbox className="h-4 w-4 text-slate-700" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>remove(a)} title="Disconnect" data-testid={`remove-${a.email}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card className="p-6 bg-slate-50/60 border-dashed">
        <h4 className="font-display text-base font-semibold mb-2">How to get a Gmail App Password (≈ 45 sec)</h4>
        <ol className="text-sm text-slate-700 space-y-1.5 list-decimal pl-5">
          <li>Make sure <strong>2-Step Verification</strong> is ON: <a className="text-red-600 underline inline-flex items-center gap-1" target="_blank" rel="noreferrer" href="https://myaccount.google.com/signinoptions/two-step-verification">myaccount.google.com/signinoptions/two-step-verification <ExternalLink className="h-3 w-3" /></a></li>
          <li>Open the App Passwords page: <a className="text-red-600 underline inline-flex items-center gap-1" target="_blank" rel="noreferrer" href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords <ExternalLink className="h-3 w-3" /></a></li>
          <li>Type a name like <em>Denplex ERP</em> and click <strong>Create</strong>. Google shows a 16-character password in 4 groups of 4.</li>
          <li>Copy it (spaces don't matter — we strip them), then click <strong>Add account</strong> above and paste it.</li>
        </ol>
        <p className="text-xs text-slate-500 mt-3">Your password is encrypted at rest and only used to connect to Google's servers. No Google Cloud Console / Client ID setup required. Works for any number of Gmail or Workspace accounts.</p>
      </Card>

      <AddEmailAccountDialog open={addOpen} onClose={()=>setAddOpen(false)} onSaved={load} />
      <InboxDialog account={inboxAcct} onClose={()=>setInboxAcct(null)} />
    </div>
  );
}

function AddEmailAccountDialog({ open, onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [label, setLabel] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setEmail(""); setPw(""); setLabel(""); setIsDefault(false); } }, [open]);

  const submit = async () => {
    if (!email || !pw) { toast.error("Email and App Password are required"); return; }
    setSaving(true);
    try {
      const r = await api.post("/email/accounts", { email, app_password: pw, label, is_default: isDefault });
      toast.success(`Connected ${r.data.email}`);
      if (r.data.imap_warning) toast.warning(r.data.imap_warning);
      onSaved && onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v)=>{ if (!v) onClose(); }}>
      <DialogContent className="rounded-sm max-w-md" data-testid="add-email-dialog">
        <DialogHeader><DialogTitle className="font-display">Connect a Gmail / mailbox</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Fld label="Email address">
            <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@gmail.com or sales@denplex.co" className="rounded-sm" data-testid="email-input" autoComplete="email" />
          </Fld>
          <Fld label="App Password (16 characters)">
            <Input value={pw} onChange={e=>setPw(e.target.value)} placeholder="abcd efgh ijkl mnop" className="rounded-sm font-mono-tech" data-testid="app-password-input" autoComplete="off" />
          </Fld>
          <Fld label="Label (optional)">
            <Input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Sales mailbox" className="rounded-sm" />
          </Fld>
          <div className="flex items-center gap-2">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} id="is-default" data-testid="is-default-switch" />
            <Label htmlFor="is-default" className="text-sm">Use as default sender</Label>
          </div>
          <p className="text-xs text-slate-500">Don't have an App Password? <a className="text-red-600 underline" target="_blank" rel="noreferrer" href="https://myaccount.google.com/apppasswords">Generate one in 30 seconds</a> — make sure 2-Step Verification is ON first.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-sm" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-email-account">{saving ? "Connecting…" : "Connect"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InboxDialog({ account, onClose }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account) { setMsgs([]); return; }
    let alive = true;
    setLoading(true);
    api.get(`/email/accounts/${account.id}/inbox?max=25`)
      .then(r => { if (alive) setMsgs(r.data?.messages || []); })
      .catch(e => { toast.error(e?.response?.data?.detail || "Failed to load inbox"); })
      .finally(()=> { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [account]);

  return (
    <Dialog open={!!account} onOpenChange={(v)=>{ if (!v) onClose(); }}>
      <DialogContent className="rounded-sm max-w-3xl" data-testid="inbox-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Inbox — {account?.email}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="text-sm text-slate-500 py-6">Loading…</div>
          ) : msgs.length === 0 ? (
            <div className="text-sm text-slate-500 py-6">No recent messages.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {msgs.map((m, i) => (
                <li key={i} className="py-3" data-testid={`inbox-row-${i}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-medium text-slate-900 truncate">{m.from_name || m.from_email}</div>
                    <div className="text-xs text-slate-500 shrink-0">{(m.date || "").slice(0, 16).replace("T", " ")}</div>
                  </div>
                  <div className="text-sm text-slate-700 truncate">{m.subject || "(no subject)"}</div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{m.snippet}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
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


function SignatoryUpload({ value, onChange }) {
  const onPick = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 1024 * 1024) { toast.error("Image must be < 1 MB"); return; }
    const r = new FileReader();
    r.onload = () => onChange(String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <Fld label="Signature image (PNG/JPG, optional)">
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt="signatory" className="h-12 border border-slate-200 bg-white p-1 rounded-sm" />
        ) : (
          <div className="h-12 w-24 border border-dashed border-slate-300 grid place-items-center text-xs text-slate-400 rounded-sm">No signature</div>
        )}
        <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 text-sm border border-slate-300 rounded-sm hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5" /> Upload
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onPick} data-testid="signatory-upload" />
        </label>
        {value && <Button size="sm" variant="outline" className="rounded-sm text-red-600 border-red-300" onClick={()=>onChange("")}>Remove</Button>}
      </div>
    </Fld>
  );
}

// Sectioned print settings toggles
const TEMPLATE_SECTIONS = [
  {
    title: "Header",
    items: [
      { key: "show_company_logo",        label: "Print company logo" },
      { key: "show_company_address",     label: "Print company address" },
      { key: "show_company_gstin",       label: "Print company GSTIN" },
      { key: "show_company_email",       label: "Print company email" },
      { key: "show_company_phone",       label: "Print company phone" },
      { key: "show_company_udyam",       label: "Print UDYAM / MSME number" },
      { key: "print_original_duplicate", label: "Print 'Original / Duplicate / Triplicate' label" },
    ],
  },
  {
    title: "Party (Bill To / Ship To)",
    items: [
      { key: "show_ship_to",      label: "Print Ship-To block (when different from Bill-To)" },
      { key: "show_bill_from",    label: "Print Bill-From block" },
      { key: "show_ship_from",    label: "Print Ship-From block" },
      { key: "show_due_date",     label: "Print due date" },
      { key: "show_place_of_supply", label: "Print place of supply" },
      { key: "show_po_meta",      label: "Print PO Date / PO No / Purchaser Name" },
    ],
  },
  {
    title: "Items Table",
    items: [
      { key: "show_item_code_column",   label: "Item Code column" },
      { key: "show_hsn_column",         label: "HSN / SAC column" },
      { key: "show_unit_column",        label: "Unit column (Mtr/Nos/Kg)" },
      { key: "show_discount_column",    label: "Discount column" },
      { key: "show_inline_gst_column",  label: "Inline GST column (off = GST only in Tax Summary)" },
    ],
  },
  {
    title: "Totals & Taxes",
    items: [
      { key: "show_tax_summary",          label: "Tax Summary table (HSN-wise CGST/SGST breakup)" },
      { key: "show_totals_sidebar",       label: "Totals sidebar (Sub Total / Tax / Round Off / Total)" },
      { key: "show_split_tax_in_sidebar", label: "Split CGST + SGST in sidebar (off = combined 'Tax (X%)' line)" },
      { key: "show_amount_in_words",      label: "Print invoice amount in words" },
    ],
  },
  {
    title: "Footer",
    items: [
      { key: "show_payment_mode",       label: "Print Payment Mode" },
      { key: "show_description",        label: "Print Description (sale note)" },
      { key: "show_terms",              label: "Print Terms & Conditions" },
      { key: "show_signatory_image",    label: "Print signature image" },
    ],
  },
  {
    title: "Bank & UPI",
    items: [
      { key: "show_bank_details",       label: "Print Bank Details block" },
      { key: "show_upi_qr",             label: "Print UPI QR (auto-generated from UPI ID)" },
      { key: "show_bank_on_new_page",   label: "Print Bank/Signature on a new page" },
    ],
  },
];
// Flat list still used in some places (back-compat)
const TEMPLATE_TOGGLES = TEMPLATE_SECTIONS.flatMap(s => s.items);

const DOC_TYPES = [
  { key: "default",          label: "Default (all docs)" },
  { key: "invoice",          label: "Tax Invoice" },
  { key: "quotation",        label: "Quotation" },
  { key: "sale_order",       label: "Sale Order" },
  { key: "delivery_challan", label: "Delivery Challan" },
  { key: "job_work_out",     label: "Job Work Out Challan" },
  { key: "credit_note",      label: "Credit Note" },
  { key: "purchase_order",   label: "Purchase Order" },
  { key: "vendor_bill",      label: "Purchase Bill" },
];

const PREVIEW_ENDPOINTS = {
  invoice:          "/invoices",
  quotation:        "/quotations",
  sale_order:       "/sale-orders",
  delivery_challan: "/delivery-challans",
  job_work_out:     "/job-work-out",
  credit_note:      "/credit-notes",
  purchase_order:   "/purchase-orders",
  vendor_bill:      "/vendor-bills",
};

function InvoiceTemplatePanel() {
  const [docType, setDocType] = useState("default");
  const [allTpl, setAllTpl] = useState(null);   // full map keyed by doc_type
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/settings/invoice-template"); setAllTpl(r.data); }
    catch (e) { toast.error("Admin only"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const t = allTpl?.[docType] || {};
  const setFlag = (k) => setAllTpl(p => ({ ...p, [docType]: { ...(p?.[docType] || {}), [k]: !p?.[docType]?.[k] } }));

  const save = async () => {
    try {
      // Save the whole map so per-doc-type overrides are preserved
      await api.put("/settings/invoice-template", allTpl);
      toast.success(`Template saved (${DOC_TYPES.find(d=>d.key===docType)?.label})`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const resetThis = () => {
    if (docType === "default") { toast.error("Cannot reset default — edit values instead"); return; }
    setAllTpl(p => ({ ...p, [docType]: { ...(p?.default || {}) } }));
    toast.success(`Reset ${DOC_TYPES.find(d=>d.key===docType)?.label} to default`);
  };

  const livePreview = async () => {
    const ep = docType === "default" ? "/invoices" : PREVIEW_ENDPOINTS[docType];
    if (!ep) { toast.error("Pick a non-default doc type to preview"); return; }
    try {
      const list = await api.get(ep);
      const first = list.data?.[0]; if (!first) { toast.error(`No ${docType} records found to preview`); return; }
      await api.put("/settings/invoice-template", allTpl);
      const r = await api.get(`${ep}/${first.id}/pdf`, { responseType: "blob" });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(r.data));
    } catch (e) { toast.error(e?.response?.data?.detail || "Preview failed"); }
  };

  if (loading || !allTpl) return <Card className="p-6"><div className="text-sm text-slate-500">Loading…</div></Card>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" data-testid="invoice-template-panel">
      <Card className="p-6 lg:col-span-2">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-semibold">Document templates</h3>
            <p className="text-sm text-slate-600 mt-1">Choose a document type below — each can have its own visibility flags. <strong>"Default"</strong> applies to any type that hasn't been customised.</p>
          </div>
        </div>
        <div className="mb-4">
          <Label className="text-xs uppercase tracking-wider text-slate-600">Editing template for</Label>
          <select
            value={docType}
            onChange={(e)=>setDocType(e.target.value)}
            data-testid="template-doc-type-select"
            className="mt-1.5 w-full h-9 border border-slate-300 rounded-sm px-2 text-sm bg-white"
          >
            {DOC_TYPES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <Label className="text-xs uppercase tracking-wider text-slate-600">Style preset</Label>
          <select
            value={t.template_style || "standard"}
            onChange={(e)=>setAllTpl(p => ({ ...p, [docType]: { ...(p?.[docType] || {}), template_style: e.target.value } }))}
            data-testid="template-style-select"
            className="mt-1.5 w-full h-9 border border-slate-300 rounded-sm px-2 text-sm bg-white"
          >
            <option value="standard">Standard — full tax-invoice layout</option>
            <option value="compact">Compact — single-page minimal</option>
            <option value="modern">Modern — clean accents, more whitespace</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">Compact auto-hides tax summary, bank, signature, terms unless toggled on below.</p>
        </div>
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" className="rounded-sm" onClick={livePreview} data-testid="preview-template"><Eye className="h-4 w-4 mr-1" /> Preview</Button>
          <Button size="sm" className="rounded-sm bg-red-600 hover:bg-red-700" onClick={save} data-testid="save-template"><Save className="h-4 w-4 mr-1" /> Save</Button>
          {docType !== "default" && <Button size="sm" variant="outline" className="rounded-sm" onClick={resetThis}>Reset to default</Button>}
        </div>
        <div className="space-y-5 max-h-[65vh] overflow-y-auto -mx-2 px-2">
          {TEMPLATE_SECTIONS.map((sec) => (
            <div key={sec.title}>
              <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 mb-1.5 sticky top-0 bg-white py-1 border-b border-slate-200">
                {sec.title}
              </div>
              <div className="space-y-0">
                {sec.items.map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 cursor-pointer">
                    <span className="text-sm text-slate-700 leading-tight">{label}</span>
                    <Switch checked={!!t[key]} onCheckedChange={()=>setFlag(key)} data-testid={`tpl-${key}`} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          {/* Numeric / text fields */}
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 mb-1.5 border-b border-slate-200 pb-1">
              Other Settings
            </div>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-600">Amount in Words locale</Label>
                <select
                  value={t.amount_in_words_locale || "en_IN"}
                  onChange={(e)=>setAllTpl(p => ({ ...p, [docType]: { ...(p?.[docType] || {}), amount_in_words_locale: e.target.value } }))}
                  className="mt-1 w-full h-9 border border-slate-300 rounded-sm px-2 text-sm bg-white"
                  data-testid="tpl-locale"
                >
                  <option value="en_IN">Indian (Lakh / Crore)</option>
                  <option value="en">English (Million / Billion)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-3 lg:col-span-3 bg-slate-50">
        <div className="flex items-center justify-between mb-2 px-3">
          <span className="text-xs uppercase tracking-wider text-slate-600">Live preview · {DOC_TYPES.find(d=>d.key===docType)?.label}</span>
          {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-red-600 underline">Open in new tab</a>}
        </div>
        {previewUrl ? (
          <iframe title="invoice-preview" src={previewUrl} className="w-full h-[78vh] bg-white border border-slate-200" data-testid="template-preview-iframe" />
        ) : (
          <div className="h-[78vh] grid place-items-center text-sm text-slate-500 border border-dashed border-slate-300">
            <div className="text-center">
              <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              Click <strong>Preview</strong> to render the first {DOC_TYPES.find(d=>d.key===docType)?.label} with current settings.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function VyaparImportPanel() {
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [opts, setOpts] = useState({ parties: true, items: true, sales: true, purchases: true, expenses: true, dry_run: false });
  const [results, setResults] = useState(null);
  const [recon, setRecon] = useState(null);

  const runReconcile = async () => {
    if (!analysis?.token) { toast.error("Upload a .vyb backup first"); return; }
    setBusy(true); setRecon(null);
    try {
      const r = await api.post("/integrations/vyapar/reconcile", { token: analysis.token });
      setRecon(r.data);
      toast[r.data.all_ok ? "success" : "warning"](r.data.all_ok ? "All rows reconcile — safe to cut over" : "Some rows differ — review below");
    } catch (e) { toast.error(e?.response?.data?.detail || "Reconcile failed"); }
    finally { setBusy(false); }
  };

  const onPick = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); setAnalysis(null); setResults(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await api.post("/integrations/vyapar/inspect", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAnalysis(r.data);
      if (r.data.kind === "unsupported") toast.warning("This file format isn't directly importable. See guidance below.");
      else toast.success(`Detected: ${r.data.kind}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Inspect failed");
    } finally { setBusy(false); e.target.value = ""; }
  };

  const runImport = async () => {
    if (!analysis?.token) { toast.error("Upload a file first"); return; }
    setBusy(true);
    try {
      const r = await api.post("/integrations/vyapar/import", { token: analysis.token, ...opts });
      setResults(r.data);
      toast.success(`Imported: ${r.data.summary || "done"}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Import failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="vyapar-import-panel">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-semibold">Import from Vyapar</h3>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">Upload your Vyapar Excel export (preferred) or your <code className="bg-slate-100 px-1">.vyb</code> backup file. We'll detect the format and pull in Parties, Items, Sale Invoices, and Purchase Invoices. Re-uploading is safe — invoices are deduped by their number.</p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-sm">
            <Upload className="h-4 w-4" /> {busy ? "Working…" : "Choose file"}
            <input type="file" accept=".xlsx,.xls,.csv,.vyb,.vybnk,.zip,.db,.sqlite" className="hidden" onChange={onPick} disabled={busy} data-testid="vyapar-file-input" />
          </label>
        </div>

        {analysis && (
          <div className="mt-5 border border-slate-200 p-4 rounded-sm bg-slate-50/60 space-y-3" data-testid="vyapar-analysis">
            <div className="text-sm">
              <div><strong>Detected format:</strong> <code className="font-mono-tech text-xs">{analysis.kind}</code></div>
              {analysis.notes && <div className="text-xs text-slate-600 mt-1">{analysis.notes}</div>}
              {analysis.tables && (
                <div className="mt-2"><strong>Tables/sheets found:</strong> <span className="font-mono-tech text-xs">{analysis.tables.join(", ")}</span></div>
              )}
              {analysis.counts && (
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries(analysis.counts).map(([k,v]) => (
                    <div key={k} className="bg-white border border-slate-200 px-3 py-2 rounded-sm">
                      <div className="text-slate-500 uppercase tracking-wider text-[10px]">{k}</div>
                      <div className="font-mono-tech text-base text-slate-900">{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {analysis.kind !== "unsupported" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                  <Toggle label="Parties (customers/suppliers)" checked={opts.parties} onChange={(v)=>setOpts({...opts, parties: v})} />
                  <Toggle label="Items / Inventory" checked={opts.items} onChange={(v)=>setOpts({...opts, items: v})} />
                  <Toggle label="Sale Invoices" checked={opts.sales} onChange={(v)=>setOpts({...opts, sales: v})} />
                  <Toggle label="Purchase Invoices" checked={opts.purchases} onChange={(v)=>setOpts({...opts, purchases: v})} />
                  <Toggle label="Expenses" checked={opts.expenses} onChange={(v)=>setOpts({...opts, expenses: v})} />
                </div>
                <div className="flex items-center gap-3 pt-2 flex-wrap">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <Switch checked={opts.dry_run} onCheckedChange={(v)=>setOpts({...opts, dry_run: v})} /> Dry run (preview without writing)
                  </label>
                  <Button onClick={runImport} disabled={busy} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="run-vyapar-import">
                    <Database className="h-4 w-4 mr-1" /> {busy ? "Importing…" : (opts.dry_run ? "Run dry import" : "Import into ERP")}
                  </Button>
                  <Button onClick={runReconcile} disabled={busy} variant="outline" className="rounded-sm" data-testid="run-vyapar-reconcile">
                    {busy ? "Working…" : "Reconcile ERP vs backup"}
                  </Button>
                </div>
              </>
            )}

            {analysis.kind === "unsupported" && (
              <div className="text-xs text-slate-700 bg-amber-50 border border-amber-200 p-3 rounded-sm">
                <p className="font-semibold mb-1">How to get a usable Excel export from Vyapar:</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Open Vyapar app → side menu → <strong>Reports</strong></li>
                  <li>Choose <strong>Sale Report</strong> (or Item/Party/Purchase Report)</li>
                  <li>Click the Excel icon (top-right) → save the <code>.xlsx</code> file</li>
                  <li>Come back here and upload that <code>.xlsx</code> instead of the <code>.vyb</code></li>
                </ol>
              </div>
            )}
          </div>
        )}

        {results && (
          <div className="mt-4 border border-emerald-200 p-4 bg-emerald-50 rounded-sm text-sm" data-testid="vyapar-results">
            <div className="font-semibold text-emerald-800 mb-2">Import complete</div>
            <pre className="text-xs whitespace-pre-wrap text-slate-700">{JSON.stringify(results.details || results, null, 2)}</pre>
          </div>
        )}

        {recon && (
          <div className={`mt-4 border p-4 rounded-sm text-sm ${recon.all_ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} data-testid="vyapar-reconcile">
            <div className={`font-semibold mb-2 ${recon.all_ok ? "text-emerald-800" : "text-amber-800"}`}>
              {recon.all_ok ? "✓ Everything reconciles — nothing lost. Safe to cut over from Vyapar." : "Some rows differ — review before cutting over."}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <th className="py-1.5 pr-2">Metric</th>
                    <th className="py-1.5 pr-2 text-right">Vyapar count</th>
                    <th className="py-1.5 pr-2 text-right">ERP count</th>
                    <th className="py-1.5 pr-2 text-right">Vyapar ₹</th>
                    <th className="py-1.5 pr-2 text-right">ERP ₹</th>
                    <th className="py-1.5 text-center">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.rows.map((r, i) => (
                    <tr key={i} className={`border-b border-slate-100 ${r.ok ? "" : "bg-red-50"}`}>
                      <td className="py-1.5 pr-2 font-medium text-slate-800">{r.metric}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-tech">{r.vyapar_count ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-tech">{r.erp_count ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-tech">{r.vyapar_total != null ? r.vyapar_total.toLocaleString("en-IN") : "—"}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-tech">{r.erp_total != null ? r.erp_total.toLocaleString("en-IN") : "—"}</td>
                      <td className="py-1.5 text-center">{r.ok ? "✅" : "❌"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{recon.note}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 bg-white rounded-sm cursor-pointer">
      <span className="text-xs text-slate-700">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}


function UnitsEditor({ units, onChange }) {
  const arr = Array.isArray(units) ? units : [];
  const update = (i, key, val) => {
    const copy = arr.map((u, idx) => idx === i ? { ...u, [key]: val } : u);
    onChange(copy);
  };
  const add = () => onChange([...arr, { name: `Unit - ${arr.length + 1}`, address: "" }]);
  const remove = (i) => onChange(arr.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3" data-testid="units-editor">
      {arr.length === 0 && (
        <div className="text-sm text-slate-500 italic">No units configured yet.</div>
      )}
      {arr.map((u, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start border border-slate-200 rounded-sm p-3 bg-slate-50">
          <div className="md:col-span-3">
            <Label className="text-xs uppercase tracking-wider text-slate-600">Unit name</Label>
            <Input value={u.name || ""} onChange={e=>update(i, "name", e.target.value)} className="mt-1 rounded-sm" placeholder={`Unit - ${i+1}`} data-testid={`unit-name-${i}`} />
          </div>
          <div className="md:col-span-8">
            <Label className="text-xs uppercase tracking-wider text-slate-600">Address</Label>
            <Textarea rows={2} value={u.address || ""} onChange={e=>update(i, "address", e.target.value)} className="mt-1 rounded-sm" placeholder="Shed No. , Estate, City, State PIN" data-testid={`unit-address-${i}`} />
          </div>
          <div className="md:col-span-1 flex md:justify-end md:items-end h-full">
            <Button type="button" variant="outline" size="icon" onClick={()=>remove(i)} className="rounded-sm h-9 w-9 mt-1 md:mt-6" data-testid={`unit-remove-${i}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="rounded-sm" data-testid="unit-add">
        <Plus className="h-4 w-4 mr-1" /> Add unit
      </Button>
    </div>
  );
}
