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
const DEFAULT_TC = "1) Order confirmation subject to advance/PO terms.\n2) Delivery schedule as mutually agreed.\n3) Prices firm unless material cost varies significantly.";
const blankLine = () => ({ item_code: "", description: "", hsn: "", qty: 1, unit: "Nos", rate: 0, discount_pct: 0, discount_amount: 0, gst_rate: 18 });
const Fld = ({ label, children }) => (<div><Label className="text-[11px] uppercase tracking-wider text-slate-500">{label}</Label><div className="mt-1">{children}</div></div>);

export default function SalesOrderCreate() {
  const navg = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    code: "", date: today, delivery_date: "", po_number: "", reference: "",
    customer_id: "", customer_name: "", customer_gstin: "", place_of_supply: "", is_interstate: false,
    terms_text: DEFAULT_TC, round_off: 0, notes: "",
  });
  const [lines, setLines] = useState([blankLine()]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [c, it] = await Promise.all([api.get("/customers"), api.get("/inventory/items")]);
        setCustomers(c.data || []); setItems(it.data || []);
      } catch (e) { /* ignore */ }
    })();
    api.get("/masters").then(r => {
      const t = r.data?.doc_terms?.["Sale Order"];
      if (t) setF(p => (p.terms_text === DEFAULT_TC || !p.terms_text ? { ...p, terms_text: t } : p));
    }).catch(() => {});
  }, []);

  const pickCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    setF(p => ({ ...p, customer_id: id, customer_name: c?.name || "", customer_gstin: c?.gstin || "", place_of_supply: c?.state || p.place_of_supply }));
  };
  const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const pickItem = (i, name) => {
    const it = items.find(x => x.name === name);
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, description: name, item_code: it?.sku || l.item_code, hsn: it?.hsn || l.hsn, gst_rate: it?.gst_rate ?? l.gst_rate, rate: it?.unit_cost || l.rate } : l));
  };
  const addLine = () => setLines(ls => [...ls, blankLine()]);
  const delLine = (i) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);

  const lineAmount = (l) => {
    let amt = Number(l.qty || 0) * Number(l.rate || 0);
    amt -= amt * Number(l.discount_pct || 0) / 100;
    amt -= Number(l.discount_amount || 0);
    return amt < 0 ? 0 : amt;
  };
  const totals = useMemo(() => {
    let subtotal = 0, gst = 0;
    for (const l of lines) { const a = lineAmount(l); subtotal += a; gst += a * Number(l.gst_rate || 0) / 100; }
    const grand = subtotal + gst + Number(f.round_off || 0);
    return { subtotal, gst, cgst: f.is_interstate ? 0 : gst / 2, sgst: f.is_interstate ? 0 : gst / 2, igst: f.is_interstate ? gst : 0, grand };
  }, [lines, f.round_off, f.is_interstate]);

  const save = async () => {
    if (!f.customer_id) { toast.error("Select a customer"); return; }
    if (!lines.some(l => (l.description || "").trim())) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      const payload = {
        ...f, round_off: Number(f.round_off || 0), status: "sent",
        lines: lines.filter(l => (l.description || "").trim()).map(l => ({
          description: l.description, item_code: l.item_code, hsn: l.hsn,
          qty: Number(l.qty || 0), unit: l.unit, rate: Number(l.rate || 0),
          discount_pct: Number(l.discount_pct || 0), discount_amount: Number(l.discount_amount || 0),
          gst_rate: Number(l.gst_rate || 0),
        })),
      };
      const r = await api.post("/sale-orders", payload);
      toast.success(`Sale Order ${r.data?.code || ""} saved`);
      navg("/app/docs/sale-orders");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save sale order"); }
    setSaving(false);
  };

  return (
    <div data-testid="so-create-page" className="pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navg("/app/docs/sale-orders")}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-bold font-display">New Sale Order</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 bg-slate-50 border border-slate-200 rounded-md p-3">
        <Fld label="Customer *">
          <select value={f.customer_id} onChange={e => pickCustomer(e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
            <option value="">Select customer…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Fld>
        <Fld label="Customer GSTIN"><Input value={f.customer_gstin} onChange={e => set("customer_gstin", e.target.value)} /></Fld>
        <Fld label="SO No (blank = auto)"><Input value={f.code} onChange={e => set("code", e.target.value)} placeholder="auto" /></Fld>
        <Fld label="Order Date"><Input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Fld>

        <Fld label="Delivery Date"><Input type="date" value={f.delivery_date} onChange={e => set("delivery_date", e.target.value)} /></Fld>
        <Fld label="Customer PO No"><Input value={f.po_number} onChange={e => set("po_number", e.target.value)} /></Fld>
        <Fld label="Reference"><Input value={f.reference} onChange={e => set("reference", e.target.value)} /></Fld>
        <Fld label="GST Type">
          <select value={f.is_interstate ? "inter" : "intra"} onChange={e => set("is_interstate", e.target.value === "inter")} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
            <option value="intra">Intra-state (CGST+SGST)</option><option value="inter">Inter-state (IGST)</option>
          </select>
        </Fld>
      </div>

      <datalist id="so-item-names">{items.map(it => <option key={it.id} value={it.name} />)}</datalist>
      <div className="overflow-x-auto border border-slate-200 rounded-md mb-4">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="p-2 w-8">#</th><th className="p-2 min-w-[180px]">Item / Description</th><th className="p-2">HSN</th><th className="p-2">Qty</th><th className="p-2">Unit</th><th className="p-2">Price/Unit</th><th className="p-2">Disc %</th><th className="p-2">Disc ₹</th><th className="p-2">GST%</th><th className="p-2 text-right">Amount</th><th className="p-2 w-8"></th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="p-2 text-slate-400">{i + 1}</td>
                <td className="p-2"><Input list="so-item-names" value={l.description} onChange={e => pickItem(i, e.target.value)} className="h-8 min-w-[180px]" placeholder="Item or description" /></td>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Fld label="Terms & Conditions"><Textarea rows={6} value={f.terms_text} onChange={e => set("terms_text", e.target.value)} /></Fld>
        <div className="border border-slate-200 rounded-md p-4 space-y-2 text-sm h-fit">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono-tech">{inr(totals.subtotal)}</span></div>
          {f.is_interstate
            ? <div className="flex justify-between"><span className="text-slate-500">IGST</span><span className="font-mono-tech">{inr(totals.igst)}</span></div>
            : <><div className="flex justify-between"><span className="text-slate-500">CGST</span><span className="font-mono-tech">{inr(totals.cgst)}</span></div><div className="flex justify-between"><span className="text-slate-500">SGST</span><span className="font-mono-tech">{inr(totals.sgst)}</span></div></>}
          <div className="flex justify-between items-center"><span className="text-slate-500">Round Off</span><Input type="number" value={f.round_off} onChange={e => set("round_off", e.target.value)} className="h-8 w-24 text-right" /></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><span>Total</span><span className="font-mono-tech text-red-600">{inr(totals.grand)}</span></div>
        </div>
      </div>

      <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-end gap-3 z-20">
        <span className="mr-auto text-sm text-slate-500">Total: <strong className="text-slate-900">{inr(totals.grand)}</strong></span>
        <Button variant="outline" className="rounded-sm" onClick={() => navg("/app/docs/sale-orders")}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700"><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save Sale Order"}</Button>
      </div>
    </div>
  );
}
