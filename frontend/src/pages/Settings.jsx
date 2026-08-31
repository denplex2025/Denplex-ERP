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
  const [mkt, setMkt] = useState({});

  const load = async () => {
    try {
      const r = await api.get("/settings/integrations"); setS(r.data || {});
      const t = await api.get("/auth/2fa/status"); setTwoFa(t.data);
    } catch (e) { toast.error("Admin only"); }
  };
  const loadMkt = async () => {
    try { const r = await api.get("/public/site-config"); setMkt(r.data || {}); }
    catch (e) { toast.error("Could not load marketing site config"); }
  };
  useEffect(() => { load(); loadMkt(); }, []);

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
  const setMF = (k, v) => setMkt(p => ({ ...p, [k]: v }));
  const saveMkt = async () => {
    try { const r = await api.put("/settings/marketing-site", mkt); setMkt(r.data || mkt); toast.success("Marketing site updated"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

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
          <TabsTrigger value="marketing" className="rounded-sm" data-testid="tab-marketing">Marketing Site</TabsTrigger>
          <TabsTrigger value="gdrive" className="rounded-sm" data-testid="tab-gdrive">Google Drive</TabsTrigger>
          <TabsTrigger value="template" className="rounded-sm" data-testid="tab-template">Invoice Template</TabsTrigger>
          <TabsTrigger value="email" className="rounded-sm" data-testid="tab-email">Email Accounts</TabsTrigger>
          <TabsTrigger value="system-email" className="rounded-sm" data-testid="tab-system-email">System Email</TabsTrigger>
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

            <h3 className="font-display text-lg font-semibold mt-8 mb-4">Header logos</h3>
            <p className="text-sm text-slate-600 mb-3">Size is clamped on the PDF automatically, so these can't distort or overflow the header no matter what you enter.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Fld label="Denplex logo width (mm, 10–35)"><Input type="number" min={10} max={35} step={0.5} value={s.denplex_logo_width_mm ?? 22} onChange={e=>setF("denplex_logo_width_mm", Number(e.target.value))} className="rounded-sm" /></Fld>
                <Fld label="Denplex logo height (mm, 10–35)"><Input type="number" min={10} max={35} step={0.5} value={s.denplex_logo_height_mm ?? 18.9} onChange={e=>setF("denplex_logo_height_mm", Number(e.target.value))} className="rounded-sm" /></Fld>
              </div>
              <IsoLogoUpload
                value={s.iso_logo_b64 || ""}
                onChange={(v)=>setF("iso_logo_b64", v)}
                width={s.iso_logo_width_mm ?? 18}
                height={s.iso_logo_height_mm ?? 18}
                onWidth={(v)=>setF("iso_logo_width_mm", v)}
                onHeight={(v)=>setF("iso_logo_height_mm", v)}
              />
            </div>

            <h3 className="font-display text-lg font-semibold mt-8 mb-4">Invoice font</h3>
            <p className="text-sm text-slate-600 mb-3">Applies to Tax Invoice, Purchase Order, Purchase Bill and every other printed document. If a font isn't available on the server it silently falls back to the default, so this can't break the PDF.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
              <Fld label="Font">
                <select value={s.font_family || "lato_light"} onChange={e=>setF("font_family", e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
                  {FONT_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </Fld>
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

        <TabsContent value="marketing">
          <Card className="p-6 mb-4">
            <h3 className="font-display text-lg font-semibold mb-1">Public homepage</h3>
            <p className="text-sm text-slate-600 mb-4">Controls the pre-login marketing page at erp.denplex.co. Changes here go live immediately without a code deploy.</p>
            <label className="flex items-center gap-2 mb-6 text-sm text-slate-700 cursor-pointer w-fit border border-slate-200 rounded-sm p-3 bg-slate-50">
              <Switch checked={!!mkt.trial_enabled} onCheckedChange={(v)=>setMF("trial_enabled", v)} data-testid="mkt-trial-enabled" />
              <span>Show "Free Trial" signup (off = homepage links straight to login, for internal-only use)</span>
            </label>

            <h4 className="font-display text-base font-semibold mb-3">Hero</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Fld label="Brand name"><Input value={mkt.brand_name || ""} onChange={e=>setMF("brand_name", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Logo URL"><Input value={mkt.logo_url || ""} onChange={e=>setMF("logo_url", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Overline"><Input value={mkt.overline || ""} onChange={e=>setMF("overline", e.target.value)} className="rounded-sm" /></Fld>
              <div className="grid grid-cols-3 gap-2">
                <Fld label="Heading prefix"><Input value={mkt.heading_prefix || ""} onChange={e=>setMF("heading_prefix", e.target.value)} className="rounded-sm" /></Fld>
                <Fld label="Heading highlight"><Input value={mkt.heading_highlight || ""} onChange={e=>setMF("heading_highlight", e.target.value)} className="rounded-sm" /></Fld>
                <Fld label="Heading suffix"><Input value={mkt.heading_suffix || ""} onChange={e=>setMF("heading_suffix", e.target.value)} className="rounded-sm" /></Fld>
              </div>
              <Fld label="Subheading"><Textarea rows={3} value={mkt.subheading || ""} onChange={e=>setMF("subheading", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Hero image URL"><Input value={mkt.hero_image || ""} onChange={e=>setMF("hero_image", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Feature image URL"><Input value={mkt.feature_image || ""} onChange={e=>setMF("feature_image", e.target.value)} className="rounded-sm" /></Fld>
              <div className="grid grid-cols-3 gap-2">
                <Fld label="Hero badge line 1"><Input value={mkt.hero_badge_line1 || ""} onChange={e=>setMF("hero_badge_line1", e.target.value)} className="rounded-sm" /></Fld>
                <Fld label="Hero badge line 2"><Input value={mkt.hero_badge_line2 || ""} onChange={e=>setMF("hero_badge_line2", e.target.value)} className="rounded-sm" /></Fld>
                <Fld label="Hero badge line 3"><Input value={mkt.hero_badge_line3 || ""} onChange={e=>setMF("hero_badge_line3", e.target.value)} className="rounded-sm" /></Fld>
              </div>
            </div>

            <h4 className="font-display text-base font-semibold mb-3">Stats strip</h4>
            <StatsEditor stats={mkt.stats || []} onChange={(arr)=>setMF("stats", arr)} />

            <h4 className="font-display text-base font-semibold mt-8 mb-3">Feature cards</h4>
            <FeaturesEditor features={mkt.features || []} onChange={(arr)=>setMF("features", arr)} />

            <h4 className="font-display text-base font-semibold mt-8 mb-3">Modules list</h4>
            <Fld label="Modules (comma-separated)">
              <Textarea rows={2} value={(mkt.modules || []).join(", ")} onChange={e=>setMF("modules", e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} className="rounded-sm" />
            </Fld>

            <h4 className="font-display text-base font-semibold mt-8 mb-3">Footer</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Footer CTA heading"><Input value={mkt.footer_cta_heading || ""} onChange={e=>setMF("footer_cta_heading", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Footer CTA sub-text"><Input value={mkt.footer_cta_sub || ""} onChange={e=>setMF("footer_cta_sub", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Footer copyright"><Input value={mkt.footer_copyright || ""} onChange={e=>setMF("footer_copyright", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Footer version line"><Input value={mkt.footer_version || ""} onChange={e=>setMF("footer_version", e.target.value)} className="rounded-sm" /></Fld>
              <Fld label="Sandbox note (shown when trial is on)"><Input value={mkt.sandbox_note || ""} onChange={e=>setMF("sandbox_note", e.target.value)} className="rounded-sm" /></Fld>
            </div>

            <div className="mt-6"><Button onClick={saveMkt} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-marketing"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
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

        <TabsContent value="system-email">
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold mb-1">System email sender</h3>
            <p className="text-sm text-slate-600 mb-4">
              Used only for automated system emails — right now, password-reset links sent from the sign-in page's
              "Forgot password?" flow. This is separate from the personal mailboxes connected under{" "}
              <strong>Email Accounts</strong>, so resets keep working even if someone disconnects their own inbox.
              {s.system_smtp_configured && <span className="ml-1 text-emerald-600 font-medium">✓ Configured</span>}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Fld label="Sender email"><Input type="email" value={s.system_smtp_email || ""} onChange={e=>setF("system_smtp_email", e.target.value)} placeholder="noreply@denplex.co" className="rounded-sm" data-testid="system-smtp-email" /></Fld>
              <Fld label="Display name"><Input value={s.system_smtp_label || ""} onChange={e=>setF("system_smtp_label", e.target.value)} placeholder="Denplex ERP" className="rounded-sm" data-testid="system-smtp-label" /></Fld>
              <Fld label={s.system_smtp_configured ? "App password (leave blank to keep current)" : "App password"}>
                <Input type="password" value={s.system_smtp_app_password || ""} onChange={e=>setF("system_smtp_app_password", e.target.value)} placeholder={s.system_smtp_configured ? "••••••••" : "16-character app password"} className="rounded-sm font-mono-tech" data-testid="system-smtp-password" />
              </Fld>
              <div className="grid grid-cols-2 gap-3">
                <Fld label="SMTP host (optional — autodetected)"><Input value={s.system_smtp_host || ""} onChange={e=>setF("system_smtp_host", e.target.value)} placeholder="smtp.gmail.com" className="rounded-sm font-mono-tech" /></Fld>
                <Fld label="SMTP port"><Input type="number" value={s.system_smtp_port || ""} onChange={e=>setF("system_smtp_port", Number(e.target.value))} placeholder="465" className="rounded-sm font-mono-tech" /></Fld>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              For Gmail/Workspace: turn on 2-Step Verification, then create an App Password at{" "}
              <a className="text-red-600 underline" target="_blank" rel="noreferrer" href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</a> and paste it here.
            </p>
            <div className="mt-4"><Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-system-email"><Save className="h-4 w-4 mr-1" /> Save</Button></div>
          </Card>
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

// Keep in sync with _FONT_CATALOG in backend/server.py
const FONT_OPTIONS = [
  { key: "lato_light",       label: "Lato Light (closest open equivalent to Calibri Light) — recommended" },
  { key: "liberation_sans",  label: "Liberation Sans (Arial-style)" },
  { key: "liberation_serif", label: "Liberation Serif (Times New Roman-style)" },
  { key: "carlito",          label: "Carlito (Calibri-style)" },
  { key: "caladea",          label: "Caladea (Cambria-style, modern serif)" },
  { key: "lato_regular",     label: "Lato Regular" },
  { key: "dejavu_sans",      label: "DejaVu Sans" },
  { key: "noto_sans",        label: "Noto Sans" },
];

function IsoLogoUpload({ value, onChange, width, height, onWidth, onHeight }) {
  const onPick = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 1024 * 1024) { toast.error("Image must be < 1 MB"); return; }
    const r = new FileReader();
    r.onload = () => onChange(String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <Fld label="ISO / Certification logo (optional — prints next to the address)">
      <div className="flex items-center gap-3 mb-2">
        {value ? (
          <img src={value} alt="ISO logo" className="h-12 border border-slate-200 bg-white p-1 rounded-sm" />
        ) : (
          <div className="h-12 w-24 border border-dashed border-slate-300 grid place-items-center text-xs text-slate-400 rounded-sm">No logo</div>
        )}
        <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 text-sm border border-slate-300 rounded-sm hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5" /> Upload
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onPick} data-testid="iso-logo-upload" />
        </label>
        {value && <Button size="sm" variant="outline" className="rounded-sm text-red-600 border-red-300" onClick={()=>onChange("")}>Remove</Button>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Fld label="Width (mm, 10–30)"><Input type="number" min={10} max={30} step={0.5} value={width} onChange={e=>onWidth(Number(e.target.value))} className="rounded-sm" /></Fld>
        <Fld label="Height (mm, 10–30)"><Input type="number" min={10} max={30} step={0.5} value={height} onChange={e=>onHeight(Number(e.target.value))} className="rounded-sm" /></Fld>
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
      { key: "show_iso_logo",            label: "Print ISO / certification logo" },
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
  const [editorOpen, setEditorOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/settings/invoice-template"); setAllTpl(r.data); }
    catch (e) { toast.error("Admin only"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const t = allTpl?.[docType] || {};
  const setFlag = (k) => setAllTpl(p => ({ ...p, [docType]: { ...(p?.[docType] || {}), [k]: !p?.[docType]?.[k] } }));
  const setField = (k, v) => setAllTpl(p => ({ ...p, [docType]: { ...(p?.[docType] || {}), [k]: v } }));

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
    <>
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
        <div className="mb-4">
          <Button size="sm" variant="outline" className="rounded-sm w-full" onClick={()=>setEditorOpen(true)} data-testid="open-template-editor">
            Template Editor — colors &amp; table widths
          </Button>
          <p className="text-xs text-slate-500 mt-1">Adjust heading/body/accent colors and table column &amp; block widths for this document type.</p>
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

    <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Template Editor — {DOC_TYPES.find(d=>d.key===docType)?.label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 max-h-[65vh] overflow-y-auto -mx-1 px-1">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 mb-2 border-b border-slate-200 pb-1">
              Font colors
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {[
                { key: "color_heading", label: "Heading (title, company name)" },
                { key: "color_body", label: "Body (table & general text)" },
                { key: "color_accent", label: "Accent (totals, underline, borders)" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs text-slate-600">{label}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(t[key] || "") ? t[key] : "#000000"}
                      onChange={(e)=>setField(key, e.target.value)}
                      className="h-9 w-9 border border-slate-300 rounded-sm cursor-pointer p-0.5 bg-white"
                      data-testid={`tpl-${key}`}
                    />
                    <Input
                      value={t[key] || ""}
                      onChange={(e)=>setField(key, e.target.value)}
                      placeholder="Default"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Leave a field blank to use the default color for that style preset.</p>
          </div>

          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 mb-2 border-b border-slate-200 pb-1">
              Line items table — column widths (mm)
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <Label className="text-xs text-slate-600">"Item name" column width</Label>
                <Input type="number" min="30" max="100" value={t.item_col_name_mm || ""} placeholder="56 (default)"
                  onChange={(e)=>setField("item_col_name_mm", e.target.value === "" ? 0 : Number(e.target.value))} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">"Amount" column width</Label>
                <Input type="number" min="16" max="40" value={t.item_col_amount_mm || ""} placeholder="24 (default)"
                  onChange={(e)=>setField("item_col_amount_mm", e.target.value === "" ? 0 : Number(e.target.value))} className="h-9 text-sm mt-1" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Other item columns stay fixed-width; these two are auto-scaled down together if they don't fit the page.</p>
          </div>

          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 mb-2 border-b border-slate-200 pb-1">
              Block widths (mm)
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <Label className="text-xs text-slate-600">Bill To box width (190mm total)</Label>
                <Input type="number" min="70" max="130" value={t.billto_split_mm || ""} placeholder="95 (default)"
                  onChange={(e)=>setField("billto_split_mm", e.target.value === "" ? 0 : Number(e.target.value))} className="h-9 text-sm mt-1" />
                <p className="text-xs text-slate-500 mt-1">Invoice Details box gets the remaining width.</p>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Totals sidebar width (190mm total)</Label>
                <Input type="number" min="40" max="65" value={t.totals_split_mm || ""} placeholder="65 (default)"
                  onChange={(e)=>setField("totals_split_mm", e.target.value === "" ? 0 : Number(e.target.value))} className="h-9 text-sm mt-1" />
                <p className="text-xs text-slate-500 mt-1">Tax Summary table gets the remaining width.</p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button size="sm" variant="outline" className="rounded-sm" onClick={()=>{
            setAllTpl(p => ({ ...p, [docType]: { ...(p?.[docType]||{}),
              color_heading: "", color_body: "", color_accent: "",
              item_col_name_mm: 0, item_col_amount_mm: 0, billto_split_mm: 0, totals_split_mm: 0 } }));
          }}>Reset to defaults</Button>
          <Button size="sm" variant="outline" className="rounded-sm" onClick={()=>{ livePreview(); }}>
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>
          <Button size="sm" className="rounded-sm bg-red-600 hover:bg-red-700" onClick={async ()=>{ await save(); setEditorOpen(false); }}>
            <Save className="h-4 w-4 mr-1" /> Save &amp; Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function VyaparImportPanel() {
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [opts, setOpts] = useState({ parties: true, items: true, sales: true, purchases: true, expenses: true, dry_run: false });
  const [results, setResults] = useState(null);
  const [recon, setRecon] = useState(null);
  const [codes, setCodes] = useState(null);   // document-number backfill report
  const [links, setLinks] = useState(null);   // payment-allocation repair report
  const [progress, setProgress] = useState("");

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

  // Document-number repair. The importer used to read txn_invoice_prefix (always NULL in real
  // Vyapar data) instead of txn_prefix_id -> kb_prefix, so imported documents lost their
  // financial-year prefix and showed as a bare "66" instead of "2627/066". New imports are
  // correct; this fixes the ~880 documents already stored. Always previewed before applying.
  const runCodeFix = async (apply = false) => {
    if (!analysis?.token) { toast.error("Upload a .vyb backup first"); return; }
    if (apply && !window.confirm("Rewrite document numbers on existing records? Run the preview first and read it.")) return;
    setBusy(true); if (!apply) setCodes(null);
    try {
      const r = await api.post(`/integrations/vyapar/backfill-codes?dry_run=${apply ? "false" : "true"}`, { token: analysis.token });
      setCodes(r.data);
      if (apply) toast.success(`Updated ${r.data.changed} document number(s)`);
      else toast.info(`Preview: ${r.data.changed} would change, ${r.data.unchanged} already correct`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Document-number fix failed"); }
    finally { setBusy(false); }
  };

  // Payment-allocation repair. Re-imports used to mint a fresh id for documents that already
  // existed, leaving the allocations written that run pointing at ids that were never stored.
  // Works entirely off ERP data, so no backup upload is needed. Matching tolerates the FY prefix,
  // so this can be run before or after the document-number fix.
  const runLinkFix = async (apply = false) => {
    if (apply && !window.confirm("Re-point payment allocations? Run the preview first and read it.")) return;
    setBusy(true); if (!apply) setLinks(null);
    try {
      const r = await api.post(`/integrations/repair/relink-allocations?dry_run=${apply ? "false" : "true"}`, {});
      setLinks(r.data);
      const n = (r.data.payments_in?.relinked || 0) + (r.data.payments_out?.relinked || 0);
      if (apply) toast.success(`Re-linked ${n} allocation(s)`);
      else toast.info(`Preview: ${n} allocation(s) would be re-linked`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Payment-link repair failed"); }
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
    setBusy(true); setResults(null); setProgress("Starting import…");
    try {
      const r = await api.post("/integrations/vyapar/import", { token: analysis.token, ...opts });
      const jobId = r.data.job_id;
      if (!jobId) { setResults(r.data); toast.success(`Imported: ${r.data.summary || "done"}`); setBusy(false); return; }
      // Large imports (thousands of transactions) run in the background so the
      // request never gets killed by a platform timeout — poll for completion.
      let tries = 0;
      const poll = async () => {
        tries += 1;
        try {
          const j = await api.get(`/integrations/vyapar/import/jobs/${jobId}`, { silent: true });
          if (j.data.status === "running") {
            setProgress(`Importing… (${tries * 3}s elapsed — large backups can take a few minutes)`);
            if (tries < 200) setTimeout(poll, 3000);
            else { toast.error("Import is taking unusually long — check back or re-open Settings."); setBusy(false); }
          } else if (j.data.status === "done") {
            setResults(j.data.result); setProgress(""); setBusy(false);
            toast.success(`Imported: ${j.data.result?.summary || "done"}`);
          } else {
            setProgress(""); setBusy(false);
            toast.error(j.data.error || "Import failed");
          }
        } catch (e) { setProgress(""); setBusy(false); toast.error("Lost track of import job — please reload"); }
      };
      setTimeout(poll, 3000);
    } catch (e) { toast.error(e?.response?.data?.detail || "Import failed"); setBusy(false); }
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
                  <Button onClick={() => runCodeFix(false)} disabled={busy} variant="outline" className="rounded-sm" data-testid="run-vyapar-codefix">
                    {busy ? "Working…" : "Preview document numbers"}
                  </Button>
                  <Button onClick={() => runLinkFix(false)} disabled={busy} variant="outline" className="rounded-sm" data-testid="run-relink">
                    {busy ? "Working…" : "Preview payment links"}
                  </Button>
                </div>
                {progress && <div className="text-xs text-slate-500" data-testid="vyapar-progress">{progress}</div>}
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

        {codes && (
          <div className="mt-4 border border-slate-200 p-4 rounded-sm text-sm bg-slate-50/60" data-testid="vyapar-codefix">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="font-semibold">
                Document numbers — {codes.dry_run ? "preview" : "applied"}
              </p>
              {codes.dry_run && codes.changed > 0 && (
                <Button onClick={() => runCodeFix(true)} disabled={busy}
                        className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="apply-vyapar-codefix">
                  Apply to {codes.changed} document{codes.changed === 1 ? "" : "s"}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-slate-700">
              <span>Scanned <strong className="font-mono-tech">{codes.scanned}</strong></span>
              <span>Will change <strong className="font-mono-tech text-red-700">{codes.changed}</strong></span>
              <span>Already correct <strong className="font-mono-tech">{codes.unchanged}</strong></span>
              <span>Not in ERP <strong className="font-mono-tech">{codes.not_in_erp}</strong></span>
              <span>Drafts <strong className="font-mono-tech">{codes.drafts}</strong></span>
            </div>

            {codes.collisions?.length > 0 && (
              <div className="mt-3 border border-red-200 bg-red-50 rounded-sm p-2">
                <p className="font-semibold text-red-800 text-xs">
                  {codes.collisions.length} number(s) would be shared by more than one document — resolve in Vyapar first
                </p>
                <ul className="mt-1 text-xs text-red-900 list-disc pl-5">
                  {codes.collisions.slice(0, 10).map((c, i) => (
                    <li key={i}><span className="font-mono-tech">{c.code}</span> — Vyapar txn {c.vyapar_ids.join(", ")}</li>
                  ))}
                </ul>
              </div>
            )}

            {codes.samples?.length > 0 && (
              <div className="mt-3 max-h-72 overflow-y-auto border border-slate-200 rounded-sm bg-white">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr className="text-left text-slate-600">
                      <th className="py-1.5 px-2">Vyapar txn</th>
                      <th className="py-1.5 px-2">Current number</th>
                      <th className="py-1.5 px-2">New number</th>
                      <th className="py-1.5 px-2">Raised?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.samples.map((c, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1.5 px-2 font-mono-tech text-slate-500">{c.vyapar_id}</td>
                        <td className="py-1.5 px-2 font-mono-tech">{c.old_code || "—"}</td>
                        <td className="py-1.5 px-2 font-mono-tech font-semibold text-emerald-700">{c.new_code}</td>
                        <td className="py-1.5 px-2">{c.is_raised ? "Yes" : <span className="text-amber-700">Draft</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-2">
              Showing up to 40 examples. Purchase bills are excluded on purpose — their number is the
              supplier's own bill number, not ours. {codes.note}
            </p>
          </div>
        )}

        {links && (() => {
          const pin = links.payments_in || {}, pout = links.payments_out || {};
          const relinked = (pin.relinked || 0) + (pout.relinked || 0);
          const dangling = (pin.dangling || 0) + (pout.dangling || 0);
          const stuck = (pin.ambiguous || 0) + (pin.unmatched || 0) + (pout.ambiguous || 0) + (pout.unmatched || 0);
          const amount = (pin.amount_relinked || 0) + (pout.amount_relinked || 0);
          return (
            <div className="mt-4 border border-slate-200 p-4 rounded-sm text-sm bg-slate-50/60" data-testid="relink-report">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-semibold">Payment links — {links.dry_run ? "preview" : "applied"}</p>
                {links.dry_run && relinked > 0 && (
                  <Button onClick={() => runLinkFix(true)} disabled={busy}
                          className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="apply-relink">
                    Re-link {relinked} allocation{relinked === 1 ? "" : "s"}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-slate-700">
                <span>Broken links <strong className="font-mono-tech text-red-700">{dangling}</strong></span>
                <span>Repairable <strong className="font-mono-tech text-emerald-700">{relinked}</strong></span>
                <span>Still unresolved <strong className="font-mono-tech">{stuck}</strong></span>
                <span>Value <strong className="font-mono-tech">₹{amount.toLocaleString("en-IN")}</strong></span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Payments-in {pin.relinked || 0}/{pin.dangling || 0} · Payments-out {pout.relinked || 0}/{pout.dangling || 0}
                {" · "}{links.dry_run ? "would re-status" : "re-statused"}{" "}
                {(links.would_restatus || links.documents_restatused || {}).invoices || 0} invoice(s),{" "}
                {(links.would_restatus || links.documents_restatused || {}).bills || 0} bill(s)
              </p>

              {links.unresolved?.length > 0 && (
                <div className="mt-3 border border-amber-200 bg-amber-50 rounded-sm p-2">
                  <p className="font-semibold text-amber-900 text-xs">
                    {links.unresolved.length} allocation(s) could not be matched — left untouched
                  </p>
                  <ul className="mt-1 text-xs text-amber-900 list-disc pl-5">
                    {links.unresolved.slice(0, 8).map((u, i) => (
                      <li key={i}>
                        {u.payment_code} → doc <span className="font-mono-tech">{u.document_code}</span>{" "}
                        ({u.party}) — {u.candidates} candidate(s)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {links.changes?.length > 0 && (
                <div className="mt-3 max-h-72 overflow-y-auto border border-slate-200 rounded-sm bg-white">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr className="text-left text-slate-600">
                        <th className="py-1.5 px-2">Payment</th>
                        <th className="py-1.5 px-2">Party</th>
                        <th className="py-1.5 px-2">Document</th>
                        <th className="py-1.5 px-2 text-right">Amount</th>
                        <th className="py-1.5 px-2">Matched on</th>
                      </tr>
                    </thead>
                    <tbody>
                      {links.changes.map((c, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="py-1.5 px-2 font-mono-tech">{c.payment_code}</td>
                          <td className="py-1.5 px-2 truncate max-w-[180px]">{c.party}</td>
                          <td className="py-1.5 px-2 font-mono-tech">{c.document_code}</td>
                          <td className="py-1.5 px-2 text-right font-mono-tech">
                            {Number(c.amount || 0).toLocaleString("en-IN")}
                          </td>
                          <td className="py-1.5 px-2 text-slate-500">
                            {c.matched_date} · ₹{Number(c.matched_total || 0).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-2">
                Showing up to 40 examples. Only allocations that resolve to exactly one document are
                re-linked; anything ambiguous is reported and left alone. {links.note}
              </p>
            </div>
          );
        })()}
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


function StatsEditor({ stats, onChange }) {
  const arr = Array.isArray(stats) ? stats : [];
  const update = (i, key, val) => onChange(arr.map((u, idx) => idx === i ? { ...u, [key]: val } : u));
  const add = () => onChange([...arr, { k: "", v: "" }]);
  const remove = (i) => onChange(arr.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2" data-testid="stats-editor">
      {arr.map((u, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-200 rounded-sm p-3 bg-slate-50">
          <div className="md:col-span-3"><Label className="text-xs uppercase tracking-wider text-slate-600">Value (e.g. 16+)</Label><Input value={u.k || ""} onChange={e=>update(i, "k", e.target.value)} className="mt-1 rounded-sm" /></div>
          <div className="md:col-span-8"><Label className="text-xs uppercase tracking-wider text-slate-600">Label</Label><Input value={u.v || ""} onChange={e=>update(i, "v", e.target.value)} className="mt-1 rounded-sm" /></div>
          <div className="md:col-span-1 flex md:justify-end"><Button type="button" variant="outline" size="icon" onClick={()=>remove(i)} className="rounded-sm h-9 w-9"><Trash2 className="h-4 w-4" /></Button></div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="rounded-sm"><Plus className="h-4 w-4 mr-1" /> Add stat</Button>
    </div>
  );
}

function FeaturesEditor({ features, onChange }) {
  const arr = Array.isArray(features) ? features : [];
  const update = (i, key, val) => onChange(arr.map((u, idx) => idx === i ? { ...u, [key]: val } : u));
  const add = () => onChange([...arr, { icon: "Cog", title: "", desc: "" }]);
  const remove = (i) => onChange(arr.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2" data-testid="features-editor">
      {arr.map((u, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start border border-slate-200 rounded-sm p-3 bg-slate-50">
          <div className="md:col-span-2"><Label className="text-xs uppercase tracking-wider text-slate-600">Icon</Label><Input value={u.icon || ""} onChange={e=>update(i, "icon", e.target.value)} className="mt-1 rounded-sm" placeholder="Boxes/Layers/ShieldCheck/BarChart3/Users/Cog" /></div>
          <div className="md:col-span-3"><Label className="text-xs uppercase tracking-wider text-slate-600">Title</Label><Input value={u.title || ""} onChange={e=>update(i, "title", e.target.value)} className="mt-1 rounded-sm" /></div>
          <div className="md:col-span-6"><Label className="text-xs uppercase tracking-wider text-slate-600">Description</Label><Textarea rows={2} value={u.desc || ""} onChange={e=>update(i, "desc", e.target.value)} className="mt-1 rounded-sm" /></div>
          <div className="md:col-span-1 flex md:justify-end md:items-end h-full"><Button type="button" variant="outline" size="icon" onClick={()=>remove(i)} className="rounded-sm h-9 w-9 mt-1 md:mt-6"><Trash2 className="h-4 w-4" /></Button></div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="rounded-sm"><Plus className="h-4 w-4 mr-1" /> Add feature</Button>
    </div>
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
