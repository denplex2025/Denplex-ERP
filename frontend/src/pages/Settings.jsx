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
import { Save, Copy, ShieldCheck, ShieldOff, Plus, Trash2, RefreshCw, Star, ExternalLink, Inbox } from "lucide-react";
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
      <PageHeader overline="Administration" title="Settings & Integrations" subtitle="Connect email mailboxes (Gmail/Outlook/Yahoo), Twilio WhatsApp, Indiamart/TradeIndia, and manage 2FA." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100 mb-4 flex-wrap h-auto">
          <TabsTrigger value="company" className="rounded-sm" data-testid="tab-company">Company</TabsTrigger>
          <TabsTrigger value="email" className="rounded-sm" data-testid="tab-email">Email Accounts</TabsTrigger>
          <TabsTrigger value="twilio" className="rounded-sm" data-testid="tab-twilio">Twilio WhatsApp</TabsTrigger>
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
