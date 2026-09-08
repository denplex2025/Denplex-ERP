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
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, a, e] = await Promise.all([
        api.get("/webhooks/config"),
        api.get("/webhooks/aisensy/config").catch(() => ({ data: null })),
        api.get("/webhooks/events").catch(() => ({ data: [] })),
      ]);
      setCfg(c.data?.mewurk || null);
      setAiCfg(a.data || null);
      setAiSigningInput(a.data?.signing_secret || "");
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

  return (
    <div data-testid="webhooks-page">
      <PageHeader overline="Integrations" title="Webhooks"
        subtitle="Give these URLs to the relevant service so it can push events into the ERP." />

      <h3 className="text-sm font-semibold text-slate-700 mb-2">Mewurk HR / Attendance</h3>
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
          <MessageCircle className="w-4 h-4 text-emerald-600" /> <span className="font-semibold">AiSensy WhatsApp</span>
          {aiCfg?.enabled
            ? <span className="text-[11px] px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 font-semibold">ENABLED</span>
            : <span className="text-[11px] px-2 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-semibold">DISABLED</span>}
        </div>
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
