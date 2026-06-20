import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

const TC_DOCS = ["Sale Invoice", "Sale Order", "Delivery Challan", "Estimate Quotation", "Proforma Invoice", "Purchase Bill", "Purchase Order"];
const PREFIX_KEYS = [["invoice", "Sale Invoice"], ["purchase_order", "Purchase Order"], ["proforma", "Proforma"], ["sale_order", "Sale Order"], ["credit_note", "Credit Note"], ["delivery_challan", "Delivery Challan"]];

export default function DocMasters() {
  const [m, setM] = useState({ doc_terms: {}, payment_terms: [], prefixes: {}, company_bank: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/masters"); setM({ doc_terms: r.data.doc_terms || {}, payment_terms: r.data.payment_terms || [], prefixes: r.data.prefixes || {}, company_bank: r.data.company_bank || {} }); }
    catch (e) { toast.error("Could not load masters"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const seed = async () => {
    if (!window.confirm("Load your Vyapar masters (Terms & Conditions, prefixes, payment terms, bank) as defaults? This overwrites the current masters.")) return;
    setBusy(true);
    try { await api.post("/admin/seed-masters", {}); toast.success("Loaded from Vyapar"); await load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  const saveSection = async (section, value) => {
    try { await api.put(`/masters/${section}`, { value }); toast.success("Saved"); }
    catch (e) { toast.error("Save failed"); }
  };

  const setTerm = (doc, v) => setM(p => ({ ...p, doc_terms: { ...p.doc_terms, [doc]: v } }));
  const setPrefix = (k, v) => setM(p => ({ ...p, prefixes: { ...p.prefixes, [k]: v } }));
  const setBank = (k, v) => setM(p => ({ ...p, company_bank: { ...p.company_bank, [k]: v } }));
  const setPT = (i, k, v) => setM(p => ({ ...p, payment_terms: p.payment_terms.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));

  if (loading) return <div className="text-slate-400 text-sm p-6">Loading…</div>;

  return (
    <div className="pb-10 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-red-600" />
          <h1 className="text-xl font-bold font-display">Document Masters</h1>
        </div>
        <Button onClick={seed} disabled={busy} variant="outline" className="rounded-sm"><Sparkles className="h-4 w-4 mr-1" /> {busy ? "Loading…" : "Load from Vyapar"}</Button>
      </div>
      <p className="text-sm text-slate-500 mb-5">Reusable Terms & Conditions per document type, invoice number prefixes, payment terms and company bank details used across the ERP.</p>

      <Section title="Terms & Conditions" onSave={() => saveSection("doc_terms", m.doc_terms)}>
        <div className="space-y-3">
          {TC_DOCS.map(d => (
            <div key={d}>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">{d}</Label>
              <Textarea rows={3} value={m.doc_terms[d] || ""} onChange={e => setTerm(d, e.target.value)} className="mt-1 text-sm" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Invoice / Document Prefixes" onSave={() => saveSection("prefixes", m.prefixes)}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {PREFIX_KEYS.map(([k, lbl]) => (
            <div key={k}>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">{lbl}</Label>
              <Input value={m.prefixes[k] || ""} onChange={e => setPrefix(k, e.target.value)} className="mt-1" placeholder="e.g. 2627/" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Payment Terms" onSave={() => saveSection("payment_terms", m.payment_terms)}>
        <div className="space-y-2">
          {(m.payment_terms || []).map((t, i) => (
            <div key={i} className="flex items-center gap-3">
              <Input value={t.name} onChange={e => setPT(i, "name", e.target.value)} className="w-48" />
              <div className="flex items-center gap-1 text-sm text-slate-500"><Input type="number" value={t.days} onChange={e => setPT(i, "days", Number(e.target.value))} className="w-20" /> days</div>
              <label className="flex items-center gap-1 text-sm text-slate-500"><input type="radio" name="pt-default" checked={!!t.is_default} onChange={() => setM(p => ({ ...p, payment_terms: p.payment_terms.map((x, idx) => ({ ...x, is_default: idx === i })) }))} className="accent-red-600" /> default</label>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Company Bank Details" onSave={() => saveSection("company_bank", m.company_bank)}>
        <div className="grid grid-cols-2 gap-3">
          {[["account_name", "Account Name"], ["bank_name", "Bank Name"], ["account_no", "Account No"], ["ifsc", "IFSC"], ["upi", "UPI ID"]].map(([k, lbl]) => (
            <div key={k}>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">{lbl}</Label>
              <Input value={m.company_bank[k] || ""} onChange={e => setBank(k, e.target.value)} className="mt-1" />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children, onSave }) {
  return (
    <div className="border border-slate-200 rounded-md p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-700">{title}</h3>
        <Button onClick={onSave} size="sm" variant="outline" className="rounded-sm"><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
      </div>
      {children}
    </div>
  );
}
