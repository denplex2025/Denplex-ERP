import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TERMS = [["", "Custom"], ["0", "Due on receipt"], ["15", "Net 15"], ["30", "Net 30"], ["45", "Net 45"], ["60", "Net 60"]];
const DEFAULT_TC = "*Subject to Ahmedabad jurisdiction only\n1) The bill must be paid within due date otherwise interest @18% will be charged extra.\n2) Goods once sold will not be taken back.\n3) Our responsibility ceases once goods leave our premises.";
const blankLine = () => ({ item_code: "", description: "", hsn: "", qty: 1, unit: "Nos", rate: 0, discount_pct: 0, discount_amount: 0, gst_rate: 18 });
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };

const Fld = ({ label, children }) => (<div><Label className="text-[11px] uppercase tracking-wider text-slate-500">{label}</Label><div className="mt-1">{children}</div></div>);

export default function InvoiceCreate() {
  const navg = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    invoice_type: "gst",
    payment_mode: "Credit", godown: "", code: "", date: today, payment_terms: "30", due_date: addDays(today, 30),
    customer_id: "", customer_name: "", customer_gstin: "", place_of_supply: "", is_interstate: false,
    purchaser_name: "", po_number: "", po_date: "", eway_bill_no: "", eway_distance_km: 0,
    terms_text: DEFAULT_TC, round_off: 0, tds: 0, tds_rate: 0, tds_section: "", tcs: 0, tcs_rate: 0, extra_charges: [], notes: "",
  });
  const [lines, setLines] = useState([blankLine()]);
  const [tdsSections, setTdsSections] = useState([]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [c, it, lo] = await Promise.all([
          api.get("/customers"), api.get("/inventory/items"),
          api.get("/inventory/locations").catch(() => ({ data: { locations: [] } })),
        ]);
        setCustomers(c.data || []); setItems(it.data || []); setLocations(lo.data?.locations || []);
      } catch (e) { /* ignore */ }
    })();
    api.get("/masters").then(r => setTdsSections(r.data?.tds_sections || [])).catch(() => {});
  }, []);

  const pickCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    setF(p => ({ ...p, customer_id: id, customer_name: c?.name || "", customer_gstin: c?.gstin || "", place_of_supply: c?.state || p.place_of_supply }));
  };
  const setTerms = (t) => setF(p => ({ ...p, payment_terms: t, due_date: t === "" ? p.due_date : addDays(p.date, t) }));
  const setDate = (d) => setF(p => ({ ...p, date: d, due_date: p.payment_terms === "" ? p.due_date : addDays(d, p.payment_terms) }));

  const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const pickItem = (i, name) => {
    const it = items.find(x => x.name === name);
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, description: name, item_code: it?.sku || l.item_code, hsn: it?.hsn || l.hsn, gst_rate: it?.gst_rate ?? l.gst_rate, rate: it?.unit_cost || l.rate } : l));
  };
  const addLine = () => setLines(ls => [...ls, blankLine()]);
  const delLine = (i) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);

  const addCharge = () => setF(p => ({ ...p, extra_charges: [...(p.extra_charges || []), { name: "", amount: 0 }] }));
  const setCharge = (i, k, v) => setF(p => ({ ...p, extra_charges: p.extra_charges.map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));
  const delCharge = (i) => setF(p => ({ ...p, extra_charges: p.extra_charges.filter((_, idx) => idx !== i) }));
  const pickTds = (sec) => {
    const s = tdsSections.find(x => `${x.section}|${x.name}` === sec);
    const rate = s ? Number(s.rate) : 0;
    setF(p => ({ ...p, tds_section: sec, tds_rate: rate, tds: Math.round((totals.subtotal * rate / 100) * 100) / 100 }));
  };
  const setTdsRate = (r) => setF(p => ({ ...p, tds_rate: r, tds_section: "", tds: Math.round((totals.subtotal * Number(r || 0) / 100) * 100) / 100 }));
  const setTcsRate = (r) => setF(p => ({ ...p, tcs_rate: r, tcs: Math.round(((totals.subtotal + totals.gst) * Number(r || 0) / 100) * 100) / 100 }));

  const lineAmount = (l) => {
    let amt = Number(l.qty || 0) * Number(l.rate || 0);
    amt -= amt * Number(l.discount_pct || 0) / 100;
    amt -= Number(l.discount_amount || 0);
    return amt < 0 ? 0 : amt;
  };
  const taxable = f.invoice_type === "gst";
  const totals = useMemo(() => {
    let subtotal = 0, gst = 0;
    for (const l of lines) { const a = lineAmount(l); subtotal += a; if (taxable) gst += a * Number(l.gst_rate || 0) / 100; }
    const chargesTotal = (f.extra_charges || []).reduce((a, c) => a + Number(c.amount || 0), 0);
    const grand = subtotal + gst + chargesTotal + Number(f.round_off || 0) - Number(f.tds || 0) + Number(f.tcs || 0);
    return { subtotal, gst, chargesTotal, cgst: f.is_interstate ? 0 : gst / 2, sgst: f.is_interstate ? 0 : gst / 2, igst: f.is_interstate ? gst : 0, grand };
  }, [lines, f.round_off, f.tds, f.tcs, f.extra_charges, f.is_interstate, taxable]);

  const save = async (goEway) => {
    if (!f.customer_id) { toast.error("Select a customer"); return; }
    if (!lines.some(l => (l.description || "").trim())) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      const payload = {
        ...f,
        round_off: Number(f.round_off || 0), tds: Number(f.tds || 0), tds_rate: Number(f.tds_rate || 0), tds_section: f.tds_section || "",
        tcs: Number(f.tcs || 0), tcs_rate: Number(f.tcs_rate || 0),
        extra_charges: (f.extra_charges || []).filter(c => (c.name || "").trim() || Number(c.amount || 0)).map(c => ({ name: c.name || "Charge", amount: Number(c.amount || 0) })),
        eway_distance_km: Number(f.eway_distance_km || 0),
        status: "sent",
        lines: lines.filter(l => (l.description || "").trim()).map(l => ({
          description: l.description, item_code: l.item_code, hsn: l.hsn,
          qty: Number(l.qty || 0), unit: l.unit, rate: Number(l.rate || 0),
          discount_pct: Number(l.discount_pct || 0), discount_amount: Number(l.discount_amount || 0),
          gst_rate: taxable ? Number(l.gst_rate || 0) : 0,
        })),
      };
      const r = await api.post("/invoices", payload);
      toast.success(`Invoice ${r.data?.code || ""} saved`);
      if (goEway && r.data?.id) navg(`/app/invoices/${r.data.id}/eway`);
      else navg("/app/invoices");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save invoice"); }
    setSaving(false);
  };

  return (
    <div data-testid="invoice-create-page" className="pb-24">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navg("/app/invoices")}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-bold font-display">New Sale Invoice</h1>
          <div className="ml-3 inline-flex rounded-sm border border-slate-200 overflow-hidden text-xs">
            {["Credit", "Cash"].map(m => (
              <button key={m} onClick={() => set("payment_mode", m)} className={`px-3 py-1.5 ${f.payment_mode === m ? "bg-red-600 text-white" : "bg-white text-slate-600"}`}>{m}</button>
            ))}
          </div>
          <div className="inline-flex rounded-sm border border-slate-200 overflow-hidden text-xs">
            {[["gst", "GST"], ["non_gst", "Non-GST"], ["export", "Export"]].map(([v, lbl]) => (
              <button key={v} onClick={() => set("invoice_type", v)} className={`px-3 py-1.5 ${f.invoice_type === v ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}>{lbl}</button>
            ))}
          </div>
        </div>
        {locations.length > 0 && (
          <Fld label="Godown">
            <select value={f.godown} onChange={e => set("godown", e.target.value)} className="h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
              <option value="">Main</option>{locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Fld>
        )}
      </div>

      {/* Header fields */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 bg-slate-50 border border-slate-200 rounded-md p-3">
        <Fld label="Customer *">
          <select value={f.customer_id} onChange={e => pickCustomer(e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
            <option value="">Select customer…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Fld>
        <Fld label="Purchaser Name"><Input value={f.purchaser_name} onChange={e => set("purchaser_name", e.target.value)} /></Fld>
        <Fld label="Invoice No (blank = auto)"><Input value={f.code} onChange={e => set("code", e.target.value)} placeholder="auto" /></Fld>
        <Fld label="Invoice Date"><Input type="date" value={f.date} onChange={e => setDate(e.target.value)} /></Fld>

        <Fld label="Payment Terms">
          <select value={f.payment_terms} onChange={e => setTerms(e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
            {TERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Fld>
        <Fld label="Due Date"><Input type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)} /></Fld>
        <Fld label="State of Supply"><Input value={f.place_of_supply} onChange={e => set("place_of_supply", e.target.value)} placeholder="e.g. Gujarat" /></Fld>
        {taxable ? (
          <Fld label="GST Type">
            <select value={f.is_interstate ? "inter" : "intra"} onChange={e => set("is_interstate", e.target.value === "inter")} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
              <option value="intra">Intra-state (CGST+SGST)</option><option value="inter">Inter-state (IGST)</option>
            </select>
          </Fld>
        ) : (
          <Fld label="Invoice Type"><Input value={f.invoice_type === "export" ? "Export (no GST)" : "Non-GST"} disabled /></Fld>
        )}

        <Fld label="PO No"><Input value={f.po_number} onChange={e => set("po_number", e.target.value)} /></Fld>
        <Fld label="PO Date"><Input type="date" value={f.po_date} onChange={e => set("po_date", e.target.value)} /></Fld>
        <Fld label="E-Way Bill No"><Input value={f.eway_bill_no} onChange={e => set("eway_bill_no", e.target.value)} /></Fld>
        <Fld label="E-Way Distance (km)"><Input type="number" value={f.eway_distance_km} onChange={e => set("eway_distance_km", e.target.value)} placeholder="auto-sets validity" /></Fld>
        <Fld label="Customer GSTIN"><Input value={f.customer_gstin} onChange={e => set("customer_gstin", e.target.value)} /></Fld>
      </div>

      {/* Line items */}
      <datalist id="item-names">{items.map(it => <option key={it.id} value={it.name} />)}</datalist>
      <div className="overflow-x-auto border border-slate-200 rounded-md mb-4">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="p-2 w-8">#</th><th className="p-2 min-w-[180px]">Item / Description</th><th className="p-2">HSN</th><th className="p-2">Qty</th><th className="p-2">Unit</th><th className="p-2">Price/Unit</th><th className="p-2">Disc %</th><th className="p-2">Disc ₹</th><th className="p-2">GST%</th><th className="p-2 text-right">Amount</th><th className="p-2 w-8"></th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="p-2 text-slate-400">{i + 1}</td>
                <td className="p-2"><Input list="item-names" value={l.description} onChange={e => pickItem(i, e.target.value)} className="h-8 min-w-[180px]" placeholder="Item or description" /></td>
                <td className="p-2"><Input value={l.hsn} onChange={e => setLine(i, "hsn", e.target.value)} className="h-8 w-20" /></td>
                <td className="p-2"><Input type="number" value={l.qty} onChange={e => setLine(i, "qty", e.target.value)} className="h-8 w-16" /></td>
                <td className="p-2"><Input value={l.unit} onChange={e => setLine(i, "unit", e.target.value)} className="h-8 w-16" /></td>
                <td className="p-2"><Input type="number" value={l.rate} onChange={e => setLine(i, "rate", e.target.value)} className="h-8 w-24" /></td>
                <td className="p-2"><Input type="number" value={l.discount_pct} onChange={e => setLine(i, "discount_pct", e.target.value)} className="h-8 w-16" /></td>
                <td className="p-2"><Input type="number" value={l.discount_amount} onChange={e => setLine(i, "discount_amount", e.target.value)} className="h-8 w-20" /></td>
                <td className="p-2"><Input type="number" value={l.gst_rate} onChange={e => setLine(i, "gst_rate", e.target.value)} className="h-8 w-16" /></td>
                <td className="p-2 text-right font-mono-tech whitespace-nowrap">{inr(lineAmount(l))}</td>
                <td className="p-2"><button className="text-slate-300 hover:text-red-600" onClick={() => delLine(i)}><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="rounded-sm mb-4" onClick={addLine}><Plus className="h-4 w-4 mr-1" /> Add Row</Button>

      {/* Terms + totals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Fld label="Terms & Conditions"><Textarea rows={6} value={f.terms_text} onChange={e => set("terms_text", e.target.value)} /></Fld>
        <div className="border border-slate-200 rounded-md p-4 space-y-2 text-sm h-fit">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono-tech">{inr(totals.subtotal)}</span></div>
          {!taxable ? null : f.is_interstate
            ? <div className="flex justify-between"><span className="text-slate-500">IGST</span><span className="font-mono-tech">{inr(totals.igst)}</span></div>
            : <><div className="flex justify-between"><span className="text-slate-500">CGST</span><span className="font-mono-tech">{inr(totals.cgst)}</span></div><div className="flex justify-between"><span className="text-slate-500">SGST</span><span className="font-mono-tech">{inr(totals.sgst)}</span></div></>}
          {(f.extra_charges || []).map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={c.name} onChange={e => setCharge(i, "name", e.target.value)} placeholder="Freight / Packing…" className="h-8 flex-1" />
              <Input type="number" value={c.amount} onChange={e => setCharge(i, "amount", e.target.value)} className="h-8 w-24 text-right" />
              <button onClick={() => delCharge(i)} className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button onClick={addCharge} className="text-xs text-red-600 hover:underline">+ Add charge (freight / packing)</button>
          <div className="flex justify-between items-center"><span className="text-slate-500">Round Off</span><Input type="number" value={f.round_off} onChange={e => set("round_off", e.target.value)} className="h-8 w-24 text-right" /></div>
          <div className="flex items-center gap-2"><span className="text-slate-500 whitespace-nowrap">TDS</span>
            <select value={f.tds_section} onChange={e => pickTds(e.target.value)} className="h-8 text-xs border border-slate-200 rounded-sm px-1 bg-white flex-1 min-w-0">
              <option value="">% / section</option>{tdsSections.map((s, i) => <option key={i} value={`${s.section}|${s.name}`}>{s.section} · {s.name} ({s.rate}%)</option>)}
            </select>
            <Input type="number" value={f.tds_rate} onChange={e => setTdsRate(e.target.value)} className="h-8 w-14 text-right" placeholder="%" />
            <Input type="number" value={f.tds} onChange={e => set("tds", e.target.value)} className="h-8 w-24 text-right" />
          </div>
          <div className="flex items-center gap-2"><span className="text-slate-500 whitespace-nowrap">TCS %</span>
            <Input type="number" value={f.tcs_rate} onChange={e => setTcsRate(e.target.value)} className="h-8 w-16 text-right" />
            <span className="text-slate-400 text-xs flex-1">amount</span>
            <Input type="number" value={f.tcs} onChange={e => set("tcs", e.target.value)} className="h-8 w-24 text-right" />
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><span>Total</span><span className="font-mono-tech text-red-600">{inr(totals.grand)}</span></div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-end gap-3 z-20">
        <span className="mr-auto text-sm text-slate-500">Total: <strong className="text-slate-900">{inr(totals.grand)}</strong></span>
        <Button variant="outline" className="rounded-sm" onClick={() => navg("/app/invoices")}>Cancel</Button>
        <Button variant="outline" className="rounded-sm" onClick={() => save(true)} disabled={saving}>Save & Generate E-Way Bill</Button>
        <Button onClick={() => save(false)} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700"><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save Invoice"}</Button>
      </div>
    </div>
  );
}
