import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, FileCheck2, Info } from "lucide-react";
import { toast } from "sonner";

const Fld = ({ label, required, children }) => (
  <div><Label className="text-[11px] uppercase tracking-wider text-slate-500">{label}{required ? <span className="text-red-500"> *</span> : null}</Label><div className="mt-1">{children}</div></div>
);
const Section = ({ title, children }) => (
  <div className="border border-slate-200 rounded-md p-4 mb-4">
    <h3 className="text-sm font-semibold text-slate-800 mb-3">{title}</h3>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>
  </div>
);
const sel = "w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white";
const validityDays = (km, odc) => { const per = odc ? 20 : 200; const d = Number(km || 0); return d > 0 ? Math.max(1, Math.ceil(d / per)) : 1; };
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };

export default function EwayBillForm() {
  const { id } = useParams();
  const navg = useNavigate();
  const [inv, setInv] = useState(null);
  const [saving, setSaving] = useState(false);
  const [gsp, setGsp] = useState({ configured: false });
  const [filing, setFiling] = useState(false);
  const [f, setF] = useState({
    transaction_type: "Regular",
    dispatch_gstin: "", dispatch_name: "", dispatch_state: "Gujarat", dispatch_pin: "", dispatch_address: "",
    ship_gstin: "", ship_name: "", ship_state: "Gujarat", ship_pin: "", ship_address: "",
    transporter_name: "", transporter_id: "",
    mode: "Road", vehicle_type: "Regular", vehicle_no: "", trans_doc_no: "", trans_doc_date: "",
    taxable_amount: 0, total_value: 0, distance_km: 0,
    eway_bill_no: "", generated_at: new Date().toISOString().slice(0, 10),
    irn: "", ack_no: "", ack_date: "", signed_qr: "",
  });
  const [filingEinv, setFilingEinv] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellingEinv, setCancellingEinv] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/invoices/${id}`);
        const d = r.data; setInv(d);
        setF(p => ({
          ...p,
          ship_gstin: d.customer_gstin || "", ship_name: d.customer_name || "", ship_state: d.place_of_supply || p.ship_state,
          ship_address: d.ship_to_address || "",
          taxable_amount: d.subtotal || 0, total_value: d.total || 0,
          eway_bill_no: d.eway_bill_no || "", distance_km: d.eway_distance_km || 0,
          irn: d.irn || "", ack_no: d.ack_no || "", ack_date: d.ack_date || "", signed_qr: d.signed_qr || "",
          ...(d.eway_details || {}),
        }));
      } catch (e) { toast.error("Could not load invoice"); }
    })();
    api.get("/eway/gsp-status").then(r => setGsp(r.data || { configured: false })).catch(() => {});
  }, [id]);

  const fileToNic = async () => {
    setFiling(true);
    try {
      const r = await api.post(`/invoices/${id}/eway-bill/file`);
      toast.success(`Filed to NIC — e-way bill ${r.data?.eway_bill_no || ""}`);
      navg("/app/invoices");
    } catch (e) { toast.error(e?.response?.data?.detail || "Filing failed"); }
    setFiling(false);
  };
  const saveEinv = async () => {
    try {
      await api.post(`/invoices/${id}/e-invoice/record`, { irn: f.irn, ack_no: f.ack_no, ack_date: f.ack_date, signed_qr: f.signed_qr });
      toast.success("e-Invoice details saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
  };
  const fileEinv = async () => {
    setFilingEinv(true);
    try {
      const r = await api.post(`/invoices/${id}/e-invoice/file`);
      toast.success(`e-Invoice generated — IRN ${(r.data?.irn || "").slice(0, 16)}…`);
      navg("/app/invoices");
    } catch (e) { toast.error(e?.response?.data?.detail || "e-Invoice filing failed"); }
    setFilingEinv(false);
  };
  const cancelEinv = async () => {
    const remark = window.prompt("Reason for cancelling this IRN? (required by NIC, e.g. 'Data entry mistake')", "Data entry mistake");
    if (remark === null) return;
    if (!window.confirm("Cancel this IRN via NIC? This can only be done within 24 hours of generation and cannot be undone.")) return;
    setCancellingEinv(true);
    try {
      await api.post(`/invoices/${id}/e-invoice/cancel`, { reason_code: "2", reason_remark: remark });
      toast.success("e-Invoice cancelled"); navg("/app/invoices");
    } catch (e) { toast.error(e?.response?.data?.detail || "Cancel failed"); }
    setCancellingEinv(false);
  };
  const cancelEway = async () => {
    const remark = window.prompt("Reason for cancelling this e-way bill? (required by NIC)", "Data entry mistake");
    if (remark === null) return;
    if (!window.confirm("Cancel this e-way bill via NIC? This can only be done within 24 hours of generation and cannot be undone.")) return;
    setCancelling(true);
    try {
      await api.post(`/invoices/${id}/eway-bill/cancel`, { reason_code: "2", reason_remark: remark });
      toast.success("E-way bill cancelled"); navg("/app/invoices");
    } catch (e) { toast.error(e?.response?.data?.detail || "Cancel failed"); }
    setCancelling(false);
  };

  const odc = f.vehicle_type === "Over Dimensional Cargo";
  const days = validityDays(f.distance_km, odc);

  const save = async () => {
    setSaving(true);
    try {
      const { eway_bill_no, generated_at, distance_km, ...details } = f;
      await api.post(`/invoices/${id}/eway-bill`, {
        eway_bill_no, generated_at, distance_km: Number(distance_km || 0),
        over_dimensional: odc, details: { ...details, distance_km: Number(distance_km || 0) },
      });
      toast.success("E-way bill details saved");
      navg("/app/invoices");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    setSaving(false);
  };

  return (
    <div data-testid="eway-form-page" className="pb-24 max-w-5xl">
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navg("/app/invoices")}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-bold font-display">E-Way Bill & e-Invoice</h1>
        {inv ? <span className="text-sm text-slate-500">— Invoice {inv.code} · {inv.customer_name}</span> : null}
      </div>
      <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2.5 mb-4">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Filing directly to the government (NIC) via our GSP (Adaequare) needs API credentials in Railway env vars. Until connected: generate the bill on the NIC portal, then paste its number below. Validity is auto-computed from distance.</span>
      </div>

      <div className="border border-slate-200 rounded-md p-4 mb-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-800">e-Invoice (IRN + signed QR)</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-sm" onClick={saveEinv}>Save e-Invoice details</Button>
            {gsp.configured && f.irn
              ? <Button size="sm" variant="outline" onClick={cancelEinv} disabled={cancellingEinv} className="rounded-sm border-red-300 text-red-700 hover:bg-red-50">{cancellingEinv ? "Cancelling…" : "Cancel IRN"}</Button>
              : null}
            {gsp.configured && !f.irn
              ? <Button size="sm" onClick={fileEinv} disabled={filingEinv} className="rounded-sm bg-red-600 hover:bg-red-700">{filingEinv ? "Generating…" : "Generate e-Invoice (auto)"}</Button>
              : null}
            {!gsp.configured ? <span className="text-[11px] text-slate-400 self-center">GSP required for auto-generate</span> : null}
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">e-Invoicing (IRN) applies once your annual turnover crosses ₹5 crore (or if you've voluntarily enabled it). Until then your GSTIN usually can't generate an IRN — this section is ready for when you're eligible.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Fld label="IRN"><Input value={f.irn} onChange={e => set("irn", e.target.value)} placeholder="paste from IRP, or auto" /></Fld>
          <Fld label="Ack No"><Input value={f.ack_no} onChange={e => set("ack_no", e.target.value)} /></Fld>
          <Fld label="Ack Date"><Input value={f.ack_date} onChange={e => set("ack_date", e.target.value)} /></Fld>
          <div className="md:col-span-3"><Fld label="Signed QR (from IRP)"><Textarea rows={2} value={f.signed_qr} onChange={e => set("signed_qr", e.target.value)} placeholder="paste the signed QR string — it prints as a QR code on the invoice PDF" /></Fld></div>
        </div>
      </div>

      <Section title="Transaction Details">
        <Fld label="Transaction Type">
          <select value={f.transaction_type} onChange={e => set("transaction_type", e.target.value)} className={sel}>
            {["Regular", "Bill To - Ship To", "Bill From - Dispatch From", "Combination of 2 & 3"].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Fld>
      </Section>

      <Section title="Your Details (Dispatch From)">
        <Fld label="GSTIN" required><Input value={f.dispatch_gstin} onChange={e => set("dispatch_gstin", e.target.value)} /></Fld>
        <Fld label="Name"><Input value={f.dispatch_name} onChange={e => set("dispatch_name", e.target.value)} /></Fld>
        <Fld label="State" required><Input value={f.dispatch_state} onChange={e => set("dispatch_state", e.target.value)} /></Fld>
        <Fld label="Dispatch Pin Code" required><Input value={f.dispatch_pin} onChange={e => set("dispatch_pin", e.target.value)} /></Fld>
        <Fld label="Dispatch Address"><Textarea rows={2} value={f.dispatch_address} onChange={e => set("dispatch_address", e.target.value)} /></Fld>
      </Section>

      <Section title="Party Details (Ship To)">
        <Fld label="GSTIN"><Input value={f.ship_gstin} onChange={e => set("ship_gstin", e.target.value)} /></Fld>
        <Fld label="Name"><Input value={f.ship_name} onChange={e => set("ship_name", e.target.value)} /></Fld>
        <Fld label="State" required><Input value={f.ship_state} onChange={e => set("ship_state", e.target.value)} /></Fld>
        <Fld label="Shipping Pin Code" required><Input value={f.ship_pin} onChange={e => set("ship_pin", e.target.value)} /></Fld>
        <Fld label="Shipping Address"><Textarea rows={2} value={f.ship_address} onChange={e => set("ship_address", e.target.value)} /></Fld>
      </Section>

      <Section title="Transport Details">
        <Fld label="Transporter Name"><Input value={f.transporter_name} onChange={e => set("transporter_name", e.target.value)} /></Fld>
        <Fld label="Transporter ID"><Input value={f.transporter_id} onChange={e => set("transporter_id", e.target.value)} /></Fld>
      </Section>

      <Section title="Part B — Vehicle">
        <Fld label="Mode">
          <select value={f.mode} onChange={e => set("mode", e.target.value)} className={sel}>{["Road", "Rail", "Air", "Ship"].map(o => <option key={o}>{o}</option>)}</select>
        </Fld>
        <Fld label="Vehicle Type">
          <select value={f.vehicle_type} onChange={e => set("vehicle_type", e.target.value)} className={sel}>{["Regular", "Over Dimensional Cargo"].map(o => <option key={o}>{o}</option>)}</select>
        </Fld>
        <Fld label="Vehicle No"><Input value={f.vehicle_no} onChange={e => set("vehicle_no", e.target.value)} placeholder="GJ01AB1234" /></Fld>
        <Fld label="Trans Doc No"><Input value={f.trans_doc_no} onChange={e => set("trans_doc_no", e.target.value)} /></Fld>
        <Fld label="Trans Doc Date"><Input type="date" value={f.trans_doc_date} onChange={e => set("trans_doc_date", e.target.value)} /></Fld>
      </Section>

      <Section title="Value & Validity">
        <Fld label="Taxable Amount (₹)" required><Input type="number" value={f.taxable_amount} onChange={e => set("taxable_amount", e.target.value)} /></Fld>
        <Fld label="Total Invoice Value (₹)" required><Input type="number" value={f.total_value} onChange={e => set("total_value", e.target.value)} /></Fld>
        <Fld label="Distance (km)"><Input type="number" value={f.distance_km} onChange={e => set("distance_km", e.target.value)} /></Fld>
        <Fld label="E-Way Bill No (from NIC)"><Input value={f.eway_bill_no} onChange={e => set("eway_bill_no", e.target.value)} placeholder="paste after generating" /></Fld>
        <Fld label="Generated On"><Input type="date" value={f.generated_at} onChange={e => set("generated_at", e.target.value)} /></Fld>
        <div className="flex items-end"><div className="text-xs text-slate-600">Validity: <strong>{days} day{days > 1 ? "s" : ""}</strong> → valid until <strong>{addDays(days)}</strong> <span className="text-slate-400">({odc ? "1 day / 20 km, ODC" : "1 day / 200 km"})</span></div></div>
      </Section>

      <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-end gap-3 z-20">
        <span className="mr-auto text-sm text-slate-500 inline-flex items-center gap-1"><FileCheck2 className="w-4 h-4" /> {f.eway_bill_no ? `E-way ${f.eway_bill_no}` : "Capture e-way details"}</span>
        <Button variant="outline" className="rounded-sm" onClick={() => navg("/app/invoices")}>Cancel</Button>
        <Button onClick={save} disabled={saving} variant="outline" className="rounded-sm"><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save details"}</Button>
        {gsp.configured && f.eway_bill_no
          ? <Button onClick={cancelEway} disabled={cancelling} variant="outline" className="rounded-sm border-red-300 text-red-700 hover:bg-red-50">{cancelling ? "Cancelling…" : "Cancel E-Way Bill"}</Button>
          : null}
        {gsp.configured && !f.eway_bill_no
          ? <Button onClick={fileToNic} disabled={filing} className="rounded-sm bg-red-600 hover:bg-red-700"><FileCheck2 className="h-4 w-4 mr-1" /> {filing ? "Filing…" : "File to NIC (auto)"}</Button>
          : null}
        {!gsp.configured ? <span className="text-[11px] text-slate-400 max-w-[220px]">Connect a GSP in server config to enable one-click filing.</span> : null}
      </div>
    </div>
  );
}
