import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { Copy, RefreshCw, Webhook, CheckCircle2, AlertTriangle, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export default function Webhooks() {
  const [cfg, setCfg] = useState(null);
  const [aiCfg, setAiCfg] = useState(null);
  const [aiSigningInput, setAiSigningInput] = useState("");
  const [metaCfg, setMetaCfg] = useState(null);
  const [metaSecretInput, setMetaSecretInput] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, a, m, e] = await Promise.all([
        api.get("/webhooks/config"),
        api.get("/webhooks/aisensy/config").catch(() => ({ data: null })),
        api.get("/webhooks/meta/config").catch(() => ({ data: null })),
        api.get("/webhooks/events").catch(() => ({ data: [] })),
      ]);
      setCfg(c.data?.mewurk || null);
      setAiCfg(a.data || null);
      setAiSigningInput(a.data?.signing_secret || "");
      setMetaCfg(m.data || null);
      // The app secret is deliberately never returned by the API, so this box always starts
      // empty. `app_secret_set` is what tells us whether one is stored.
      setMetaSecretInput("");
      setEvents(e.data || []);
    } catch (err) { toast.error("Could not load webhook settings"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const copy = (txt) => { navigator.clipboard?.writeText(txt); toast.success("Copied"); };
  const toggle = async () => {
    try { await api.post("/webhooks/config", { enabled: !cfg.enabled }); toast.success("Updated"); load(); }
    catch (e) { toast.error("Failed"); }
  };
  const rotate = async () => {
    if (!window.confirm("Rotate the secret? The old webhook URL will stop working and must be updated in Mewurk.")) return;
    try { const r = await api.post("/webhooks/config", { rotate: true }); toast.success("Secret rotated"); load(); }
    catch (e) { toast.error("Failed"); }
  };

  const aiToggle = async () => {
    try { await api.post("/webhooks/aisensy/config", { enabled: !aiCfg.enabled }); toast.success("Updated"); load(); }
    catch (e) { toast.error("Failed"); }
  };
  const aiRotate = async () => {
    if (!window.confirm("Rotate the secret? The old webhook URL will stop working and must be updated in AiSensy.")) return;
    try { await api.post("/webhooks/aisensy/config", { rotate: true }); toast.success("Secret rotated"); load(); }
    catch (e) { toast.error("Failed"); }
  };
  const aiSaveSigningSecret = async () => {
    try { await api.post("/webhooks/aisensy/config", { signing_secret: aiSigningInput }); toast.success("Saved"); load(); }
    catch (e) { toast.error("Failed"); }
  };

  const metaToggle = async () => {
    try { await api.post("/webhooks/meta/config", { enabled: !metaCfg.enabled }); toast.success("Updated"); load(); }
    catch (e) { toast.error("Failed"); }
  };
  const metaSaveAppSecret = async () => {
    if (!metaSecretInput.trim()) return toast.error("Paste the App Secret first");
    try {
      await api.post("/webhooks/meta/config", { app_secret: metaSecretInput.trim() });
      toast.success("App Secret saved — signatures are now verified");
      setMetaSecretInput(""); load();
    } catch (e) { toast.error("Failed"); }
  };
  const metaClearAppSecret = async () => {
    if (!window.confirm("Remove the App Secret? Incoming Meta events will stop being signature-checked.")) return;
    try { await api.post("/webhooks/meta/config", { app_secret: "" }); toast.success("Removed"); load(); }
    catch (e) { toast.error("Failed"); }
  };
  const metaRotate = async () => {
    if (!window.confirm(
      "Rotate the callback secret?\n\nThis changes the webhook URL AND the verify token. " +
      "Meta will keep posting to the OLD url, which will stop working, until you paste the new " +
      "url and token into the app's WhatsApp → Configuration page. Orders typed on WhatsApp will " +
      "not reach the ERP in between."
    )) return;
    try { await api.post("/webhooks/meta/config", { rotate: true }); toast.success("Rotated — update Meta now"); load(); }
    catch (e) { toast.error("Failed"); }
  };

  return (
    <div data-testid="webhooks-page">
      <PageHeader overline="Integrations" title="Webhooks"
        subtitle="Give these URLs to the relevant service so it can push events into the ERP." />

      <h3 className="text-sm font-semibold text-slate-700 mb-2">WhatsApp → Purchase Order drafts (Meta Cloud API)</h3>
      <Card><div className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <MessageCircle className="w-4 h-4 text-emerald-600" /> <span className="font-semibold">Meta WhatsApp Cloud API</span>
          {metaCfg?.enabled
            ? <span className="text-[11px] px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 font-semibold">ENABLED</span>
            : <span className="text-[11px] px-2 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-semibold">DISABLED</span>}
          <span className="text-[11px] px-2 py-0.5 rounded-sm bg-red-50 text-red-700 font-semibold border border-red-200">LIVE PATH</span>
        </div>
        <p className="text-[11px] text-slate-500">
          Type an order to a supplier in the <strong>WhatsApp Business app on +91 70410 65333</strong> and it
          arrives here as a <strong>draft</strong> Purchase Order for review. Nothing is ever sent to a supplier
          automatically. Messages the supplier sends <em>to</em> you are logged but never turned into an order —
          Meta separates the two directions into different webhook fields, so a reply like "ok, 50 confirmed"
          cannot become a duplicate PO.
        </p>

        {!metaCfg?.app_secret_set && (
          <div className="flex gap-2 items-start p-2.5 rounded-sm bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900">
              <strong>Signatures are not being verified.</strong> Until the App Secret below is set, the ERP
              accepts any correctly-addressed POST as if it came from Meta. The random token in the callback URL
              is the only thing protecting it. Paste the secret to close this properly.
            </p>
          </div>
        )}

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Callback URL (Meta app → WhatsApp → Configuration → Webhook)</div>
          <div className="flex gap-2">
            <input readOnly value={metaCfg?.url || ""} className="flex-1 h-9 px-2 rounded-sm border border-slate-200 text-xs font-mono-tech bg-slate-50" />
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => copy(metaCfg?.url || "")}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Verify token (same screen, "Verify token" box)</div>
          <div className="flex gap-2">
            <input readOnly value={metaCfg?.verify_token || ""} className="flex-1 h-9 px-2 rounded-sm border border-slate-200 text-xs font-mono-tech bg-slate-50" />
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => copy(metaCfg?.verify_token || "")}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
            Meta App Secret
            {metaCfg?.app_secret_set
              ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 font-semibold">SET · SIGNATURES VERIFIED</span>
              : <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 font-semibold">NOT SET</span>}
          </div>
          <div className="flex gap-2">
            <Input type="password" value={metaSecretInput} onChange={e => setMetaSecretInput(e.target.value)}
              placeholder={metaCfg?.app_secret_set ? "Paste a new secret to replace the stored one" : "App settings → Basic → App secret → Show"}
              className="h-9 text-xs font-mono-tech" />
            <Button variant="outline" size="sm" className="rounded-sm" onClick={metaSaveAppSecret}>Save</Button>
            {metaCfg?.app_secret_set && (
              <Button variant="ghost" size="sm" className="rounded-sm text-slate-500" onClick={metaClearAppSecret}>Remove</Button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Used to check the <code>X-Hub-Signature-256</code> header on every incoming event. Stored write-only —
            it is never sent back to this page, so the box stays blank even once a secret is saved.
          </p>
        </div>

        <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">
          <strong className="text-slate-700">Webhook fields to subscribe:</strong>{" "}
          <code>messages</code>, <code>smb_message_echoes</code>, <code>smb_app_state_sync</code>.
          <br />
          <code>smb_message_echoes</code> is the one that carries messages typed in the WhatsApp Business app —
          without it nothing arrives, and the failure is silent. Plain <code>message_echoes</code> is
          allowlist-gated by Meta and is not needed.
          {metaCfg?.waba_id ? <> <br />WABA: <code>{metaCfg.waba_id}</code></> : null}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-sm" onClick={metaToggle}>{metaCfg?.enabled ? "Disable" : "Enable"}</Button>
          <Button variant="outline" size="sm" className="rounded-sm text-amber-700 border-amber-200" onClick={metaRotate}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Rotate callback secret</Button>
        </div>
      </div></Card>

      <h3 className="text-sm font-semibold text-slate-700 mt-5 mb-2">Mewurk HR / Attendance</h3>
      <Card><div className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Webhook className="w-4 h-4 text-red-600" /> <span className="font-semibold">Mewurk HR</span>
          {cfg?.enabled
            ? <span className="text-[11px] px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 font-semibold">ENABLED</span>
            : <span className="text-[11px] px-2 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-semibold">DISABLED</span>}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Webhook URL (paste into Mewurk)</div>
          <div className="flex gap-2">
            <input readOnly value={cfg?.url || ""} className="flex-1 h-9 px-2 rounded-sm border border-slate-200 text-xs font-mono-tech bg-slate-50" />
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => copy(cfg?.url || "")}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">The secret token is embedded in this URL — anyone with it can post events, so treat it like a password. Method: <strong>POST</strong>, body: <strong>JSON</strong>.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-sm" onClick={toggle}>{cfg?.enabled ? "Disable" : "Enable"}</Button>
          <Button variant="outline" size="sm" className="rounded-sm text-amber-700 border-amber-200" onClick={rotate}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Rotate secret</Button>
          <Button variant="ghost" size="sm" className="rounded-sm ml-auto" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh events</Button>
        </div>
      </div></Card>

      <h3 className="text-sm font-semibold text-slate-700 mt-5 mb-2">AiSensy WhatsApp → Purchase Order drafts</h3>
      <Card><div className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <MessageCircle className="w-4 h-4 text-slate-400" /> <span className="font-semibold">AiSensy WhatsApp</span>
          {aiCfg?.enabled
            ? <span className="text-[11px] px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 font-semibold">ENABLED</span>
            : <span className="text-[11px] px-2 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-semibold">DISABLED</span>}
          <span className="text-[11px] px-2 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-semibold">SUPERSEDED</span>
        </div>
        <p className="text-[11px] text-slate-500">
          <strong>Kept as a fallback only.</strong> The Meta card above is the live route — it gets the same
          events free and direct, and AiSensy charges ₹2,000 + GST a month for this webhook. AiSensy is still
          used for broadcasts and campaigns on the same number; only this order-capture path moved.
        </p>
        <p className="text-[11px] text-slate-500">
          Subscribe to "message.created" — it fires for messages sent by an agent, assistant, user or broadcast, so it captures orders you type OUT to a supplier. ("message.sender.user" only fires for messages coming IN.) Every event is logged raw below before processing, so you can inspect the real payload. When you type an order into WhatsApp, an AI model reads the
          message and — if it looks like a purchase order — creates a <strong>draft</strong> Purchase Order here
          for you to review, fix up the supplier/items, and approve. Nothing is sent to a supplier automatically.
        </p>

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Webhook URL (add as a subscription in AiSensy → subscribe to topic "message.created")</div>
          <div className="flex gap-2">
            <input readOnly value={aiCfg?.url || ""} className="flex-1 h-9 px-2 rounded-sm border border-slate-200 text-xs font-mono-tech bg-slate-50" />
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => copy(aiCfg?.url || "")}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">AiSensy webhook signing secret (optional but recommended)</div>
          <div className="flex gap-2">
            <Input type="password" value={aiSigningInput} onChange={e => setAiSigningInput(e.target.value)}
              placeholder="Paste the shared secret AiSensy shows for this webhook subscription" className="h-9 text-xs font-mono-tech" />
            <Button variant="outline" size="sm" className="rounded-sm" onClick={aiSaveSigningSecret}>Save</Button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Used to verify the <code>X-AiSensy-Signature</code> header on incoming events. Leave blank to skip verification.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-sm" onClick={aiToggle}>{aiCfg?.enabled ? "Disable" : "Enable"}</Button>
          <Button variant="outline" size="sm" className="rounded-sm text-amber-700 border-amber-200" onClick={aiRotate}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Rotate secret</Button>
        </div>
      </div></Card>

      <h3 className="text-sm font-semibold text-slate-700 mt-5 mb-2">Recent received events</h3>
      <Card>
        {loading ? <Empty label="Loading…" /> : events.length === 0 ? <Empty label="No events received yet. Send a test from Mewurk to confirm the connection." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th>Received</Th><Th>Source</Th><Th>Result</Th><Th>Payload (preview)</Th></tr></thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="p-2 whitespace-nowrap text-slate-500">{fmtDate(ev.received_at)}</td>
                    <td className="p-2 uppercase text-xs font-semibold">{ev.source}</td>
                    <td className="p-2">{ev.processed
                      ? <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {ev.result}</span>
                      : <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {ev.result || "logged"}</span>}</td>
                    <td className="p-2"><code className="text-[11px] text-slate-500 break-all">{JSON.stringify(ev.body).slice(0, 200)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
