import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Card, Th, Td, Empty, fmtDate, inr } from "@/components/erp/Primitives";
import ExportMenu from "@/components/erp/ExportMenu";
import { Plus, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";

const PAYMENT_TYPES = ["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"];
const n = (v) => Number(v || 0);

export default function PaymentIn() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ payment_type: "Cash", date: new Date().toISOString().slice(0, 10) });
  const [openInvoices, setOpenInvoices] = useState([]);
  const [allocs, setAllocs] = useState({});   // invoiceId -> { amount, tds }
  const [advance, setAdvance] = useState("");

  const load = async () => {
    try {
      const r = await api.get("/payments-in"); setRows(r.data || []);
      const c = await api.get("/customers"); setCustomers(c.data || []);
    } catch (e) { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const pickParty = async (party_id) => {
    setForm(p => ({ ...p, party_id }));
    setAllocs({}); setOpenInvoices([]); setAdvance("");
    try { const r = await api.get(`/payments-in/open-invoices/${party_id}`); setOpenInvoices(r.data || []); }
    catch (e) { /* party may have no invoices */ }
  };

  const setAlloc = (id, key, val) => setAllocs(a => ({ ...a, [id]: { ...(a[id] || {}), [key]: val } }));
  const settleRow = (inv) => setAlloc(inv.id, "amount", inv.outstanding);

  const allocAmount = Object.values(allocs).reduce((s, a) => s + n(a.amount), 0);
  const allocTds = Object.values(allocs).reduce((s, a) => s + n(a.tds), 0);
  const totalReceived = allocAmount + n(advance);

  const resetForm = () => { setForm({ payment_type: "Cash", date: new Date().toISOString().slice(0, 10) }); setAllocs({}); setOpenInvoices([]); setAdvance(""); };

  const save = async () => {
    const cust = customers.find(c => c.id === form.party_id);
    if (!form.party_id) { toast.error("Select a customer"); return; }
    const allocations = openInvoices
      .filter(inv => n(allocs[inv.id]?.amount) > 0 || n(allocs[inv.id]?.tds) > 0)
      .map(inv => ({ document_id: inv.id, document_code: inv.code, document_type: "invoice", amount: n(allocs[inv.id]?.amount), tds_amount: n(allocs[inv.id]?.tds) }));
    const amount = allocations.length ? totalReceived : n(form.amount);
    if (!amount && !allocTds) { toast.error("Enter an amount or allocate to an invoice"); return; }
    // guard: don't let a row's amount+tds exceed its outstanding
    for (const inv of openInvoices) {
      const a = allocs[inv.id]; if (!a) continue;
      if (n(a.amount) + n(a.tds) > inv.outstanding + 0.01) { toast.error(`${inv.code}: amount + TDS exceeds outstanding ${inr(inv.outstanding)}`); return; }
    }
    try {
      const payload = { ...form, party_name: cust?.name || "", amount, allocations };
      await api.post("/payments-in", payload);
      toast.success("Payment received");
      setOpen(false); resetForm(); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const total = rows.reduce((s, r) => s + n(r.amount), 0);

  return (
    <div data-testid="payments-in-page">
      <PageHeader
        overline="Sale"
        title="Payment-In"
        subtitle="Money received from customers — settle invoices and adjust TDS deducted at source."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu collection="payments-in" />
            <Button onClick={() => { resetForm(); setOpen(true); }} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="add-payment-in">
              <Plus className="h-4 w-4 mr-1" /> Add Payment-In
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Received</div>
          <div className="font-display text-2xl font-bold mt-1 text-emerald-700">{inr(total)}</div>
          <div className="text-xs text-slate-500 mt-1">{rows.length} payment(s)</div>
        </Card>
      </div>

      <Card>
        {rows.length === 0 ? <Empty label="No payments received yet." /> : (
          <table className="w-full">
            <thead>
              <tr><Th>Date</Th><Th>Ref.</Th><Th>Party Name</Th><Th>Amount</Th><Th>Received via</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>{fmtDate(r.date)}</Td>
                  <Td className="font-mono-tech text-xs">{r.code}</Td>
                  <Td>{r.party_name}</Td>
                  <Td className="font-medium">{inr(r.amount)}</Td>
                  <Td>{r.payment_type}{r.ref_no ? ` · ${r.ref_no}` : ""}</Td>
                  <Td>
                    <Badge variant="outline" className={`rounded-sm uppercase text-[10px] ${r.status === "Used" ? "border-emerald-600 text-emerald-700" : r.status === "Partially Used" ? "border-amber-600 text-amber-700" : "border-slate-400 text-slate-600"}`}>
                      {r.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><ArrowDownToLine className="h-4 w-4 text-emerald-600" /> Add Payment-In</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Party *">
              <Select value={form.party_id || ""} onValueChange={pickParty}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date *"><Input type="date" value={form.date || ""} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="rounded-sm" /></Field>
            <Field label="Payment Type">
              <Select value={form.payment_type} onValueChange={v => setForm(p => ({ ...p, payment_type: v }))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Reference No (cheque/UPI/txn)"><Input value={form.ref_no || ""} onChange={e => setForm(p => ({ ...p, ref_no: e.target.value }))} className="rounded-sm" /></Field>
          </div>

          {/* Settle invoices + TDS adjustment */}
          {form.party_id && (
            <div className="mt-3">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Apply to invoices</Label>
              {openInvoices.length === 0 ? (
                <div className="text-sm text-slate-400 mt-1 border border-dashed border-slate-200 rounded-sm p-3">No open invoices for this customer — record as advance below.</div>
              ) : (
                <div className="mt-1 border border-slate-200 rounded-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="p-2">Invoice</th><th className="p-2 text-right">Outstanding</th><th className="p-2 w-28">Amount Recd</th><th className="p-2 w-24">TDS Deducted</th><th className="p-2 w-14"></th>
                    </tr></thead>
                    <tbody>
                      {openInvoices.map(inv => {
                        const a = allocs[inv.id] || {};
                        const left = inv.outstanding - n(a.amount) - n(a.tds);
                        return (
                          <tr key={inv.id} className="border-t border-slate-100">
                            <td className="p-2"><div className="font-mono-tech text-xs">{inv.code}</div><div className="text-[10px] text-slate-400">{fmtDate(inv.date)}</div></td>
                            <td className="p-2 text-right font-mono-tech">{inr(inv.outstanding)}</td>
                            <td className="p-2"><Input type="number" value={a.amount || ""} onChange={e => setAlloc(inv.id, "amount", e.target.value)} className="h-8 rounded-sm text-right" placeholder="0" /></td>
                            <td className="p-2"><Input type="number" value={a.tds || ""} onChange={e => setAlloc(inv.id, "tds", e.target.value)} className="h-8 rounded-sm text-right" placeholder="0" /></td>
                            <td className="p-2 text-center">
                              <button onClick={() => settleRow(inv)} className="text-[10px] text-red-600 hover:underline" title="Fill full outstanding as amount">full</button>
                              {Math.abs(left) < 0.01 && (n(a.amount) || n(a.tds)) ? <div className="text-[10px] text-emerald-600">settled</div> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <Field label="Advance / Unallocated (₹)"><Input type="number" value={advance} onChange={e => setAdvance(e.target.value)} className="rounded-sm font-mono-tech" placeholder="0" /></Field>
            <Field label="Bank Name"><Input value={form.bank_name || ""} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} className="rounded-sm" /></Field>
            <div className="flex flex-col justify-end">
              <div className="text-xs text-slate-500">Amount received <strong className="text-slate-900 font-mono-tech">{inr(totalReceived)}</strong></div>
              {allocTds > 0 && <div className="text-xs text-slate-500">TDS adjusted <strong className="text-amber-700 font-mono-tech">{inr(allocTds)}</strong></div>}
            </div>
          </div>
          <div className="mt-2"><Field label="Notes"><Textarea rows={2} value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-sm" /></Field></div>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1">{children}</div></div>
);
