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
        <TabsList className="rounded-sm bg-slate-100 mb-4">
          <TabsTrigger value="company" className="rounded-sm" data-testid="tab-company">Company</TabsTrigger>
          <TabsTrigger value="twilio" className="rounded-sm" data-testid="tab-twilio">Twilio WhatsApp</TabsTrigger>
          <TabsTrigger value="resend" className="rounded-sm" data-testid="tab-resend">Resend Email</TabsTrigger>
          <TabsTrigger value="indiamart" className="rounded-sm" data-testid="tab-indiamart">Indiamart</TabsTrigger>
          <TabsTrigger value="tradeindia" className="rounded-sm" data-testid="tab-tradeindia">TradeIndia</TabsTrigger>
          <TabsTrigger value="2fa" className="rounded-sm" data-testid="tab-2fa">2FA</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Company Name"><Input value={s.company_name || ""} onChange={e=>setF("company_name", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Company GSTIN"><Input value={s.company_gstin || ""} onChange={e=>setF("company_gstin", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="State"><Input value={s.company_state || ""} onChange={e=>setF("company_state", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Address"><Textarea rows={3} value={s.company_address || ""} onChange={e=>setF("company_address", e.target.value)} className="rounded-sm" /></Fld>
            </div>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-company"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="twilio">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Get credentials from <a className="text-blue-700 underline" target="_blank" rel="noreferrer" href="https://console.twilio.com/">Twilio Console</a>. For sandbox use <code className="bg-slate-100 px-1">whatsapp:+14155238886</code>.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Account SID"><Input value={s.twilio_account_sid || ""} onChange={e=>setF("twilio_account_sid", e.target.value)} className="rounded-sm font-mono-tech" data-testid="twilio-sid" /></Fld>
              <Fld label="Auth Token"><Input type="password" value={s.twilio_auth_token || ""} onChange={e=>setF("twilio_auth_token", e.target.value)} className="rounded-sm font-mono-tech" data-testid="twilio-token" /></Fld>
              <Fld label="From WhatsApp number"><Input value={s.twilio_whatsapp_from || ""} onChange={e=>setF("twilio_whatsapp_from", e.target.value)} placeholder="whatsapp:+14155238886" className="rounded-sm font-mono-tech" data-testid="twilio-from" /></Fld>
            </div>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-twilio"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="resend">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Get an API key from <a className="text-blue-700 underline" target="_blank" rel="noreferrer" href="https://resend.com/api-keys">Resend dashboard</a>. Verify your sender domain to send to any recipient.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Resend API Key"><Input type="password" value={s.resend_api_key || ""} onChange={e=>setF("resend_api_key", e.target.value)} placeholder="re_xxxxxxxxxxxx" className="rounded-sm font-mono-tech" data-testid="resend-key" /></Fld>
              <Fld label="From Email"><Input value={s.resend_from_email || ""} onChange={e=>setF("resend_from_email", e.target.value)} placeholder="noreply@yourdomain.com" className="rounded-sm" data-testid="resend-from" /></Fld>
            </div>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-resend"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="indiamart">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Get your <strong>glusr_crm_key</strong> from Indiamart Seller Panel → Lead Manager → API. Pulls the last 7 days of leads by default.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Indiamart CRM Key"><Input type="password" value={s.indiamart_crm_key || ""} onChange={e=>setF("indiamart_crm_key", e.target.value)} className="rounded-sm font-mono-tech" data-testid="indiamart-key" /></Fld>
            </div>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-indiamart"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="tradeindia">
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Set a secret token below, then paste this webhook URL in your TradeIndia "Lead Webhook" settings. Each lead POSTed will be auto-added.</p>
            <Fld label="Webhook Secret Token (your choice)">
              <Input value={s.tradeindia_webhook_secret || ""} onChange={e=>setF("tradeindia_webhook_secret", e.target.value)} placeholder="long-random-string" className="rounded-sm font-mono-tech" data-testid="ti-secret" />
            </Fld>
            <div className="mt-3"><Button onClick={save} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-tradeindia"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
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
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold mb-2">Two-factor authentication (TOTP)</h3>
            <p className="text-sm text-slate-600 mb-4">Use Google Authenticator, Authy, or any TOTP app. Once enabled, you'll be asked for a 6-digit code on every login.</p>
            {twoFa.enabled ? (
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 text-emerald-700"><ShieldCheck className="h-4 w-4" /> Enabled</div>
                <Button onClick={disable2fa} variant="outline" className="rounded-sm border-red-300 text-red-700 hover:bg-red-50" data-testid="disable-2fa"><ShieldOff className="h-4 w-4 mr-1" /> Disable</Button>
              </div>
            ) : (
              <Button onClick={setup2fa} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="setup-2fa"><ShieldCheck className="h-4 w-4 mr-1" /> Enable 2FA</Button>
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
              <a href={setup.otpauth_url} className="text-xs text-blue-700 underline" target="_blank" rel="noreferrer">Open in authenticator (mobile)</a>
              <div>
                <Label className="text-xs uppercase">6-digit code</Label>
                <Input value={code} onChange={e=>setCode(e.target.value)} className="rounded-sm font-mono-tech mt-1.5" data-testid="2fa-code" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setSetupOpen(false)}>Cancel</Button>
            <Button onClick={enable2fa} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="enable-2fa">Enable</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Fld = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
