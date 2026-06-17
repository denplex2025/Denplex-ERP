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
  const [f, setF] = useState({
    transaction_type: "Regular",
    dispatch_gstin: "", dispatch_name: "", dispatch_state: "Gujarat", dispatch_pin: "", dispatch_address: "",
    ship_gstin: "", ship_name: "", ship_state: "Gujarat", ship_pin: "", ship_address: "",
    transporter_name: "", transporter_id: "",
    mode: "Road", vehicle_type: "Regular", vehicle_no: "", trans_doc_no: "", trans_doc_date: "",
    taxable_amount: 0, total_value: 0, distance_km: 0,
    eway_bill_no: "", generated_at: new Date().toISOString().slice(0, 10),
  });
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
          ...(d.eway_details || {}),
        }));
      } catch (e) { toast.error("Could not load invoice"); }
    })();
  }, [id]);

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
        <h1 className="text-xl font-bold font-display">Generate E-Way Bill</h1>
        {inv ? <span className="text-sm text-slate-500">— Invoice {inv.code} · {inv.customer_name}</span> : null}
      </div>
      <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2.5 mb-4">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Filing directly to the government (NIC) needs a connected GSP. For now: generate the bill on the NIC portal, then paste its number below. Validity is auto-computed from distance.</span>
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
        <Button onClick={save} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700"><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save E-Way Bill"}</Button>
      </div>
    </div>
  );
}
