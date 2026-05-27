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
import { Plus, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";

const PAYMENT_TYPES = ["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"];

export default function PaymentOut() {
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ payment_type: "Cash", date: new Date().toISOString().slice(0, 10) });

  const load = async () => {
    try {
      const r = await api.get("/payments-out"); setRows(r.data || []);
      const c = await api.get("/suppliers"); setSuppliers(c.data || []);
    } catch (e) { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const cust = suppliers.find(c => c.id === form.party_id);
      const payload = { ...form, party_name: cust?.name || form.party_name || "", amount: Number(form.amount || 0) };
      if (!payload.party_id || !payload.amount) { toast.error("Party + amount required"); return; }
      await api.post("/payments-out", payload);
      toast.success("Payment recorded");
      setOpen(false);
      setForm({ payment_type: "Cash", date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const received_count = rows.length;

  return (
    <div data-testid="payments-out-page">
      <PageHeader
        overline="Purchase & Expense"
        title="Payment-Out"
        subtitle="Money paid to suppliers — for purchase bills or as advance."
        actions={
          <Button onClick={() => setOpen(true)} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="add-payment-in">
            <Plus className="h-4 w-4 mr-1" /> Add Payment-Out
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Paid</div>
          <div className="font-display text-2xl font-bold mt-1 text-red-700">{inr(total)}</div>
          <div className="text-xs text-slate-500 mt-1">{received_count} payment(s)</div>
        </Card>
      </div>

      <Card>
        {rows.length === 0 ? <Empty label="No payments made yet." /> : (
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
                    <Badge variant="outline" className={`rounded-sm uppercase text-[10px] ${r.status === "Used" ? "border-emerald-600 text-red-700" : r.status === "Partially Used" ? "border-amber-600 text-amber-700" : "border-slate-400 text-slate-600"}`}>
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
        <DialogContent className="rounded-sm max-w-lg">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4 text-emerald-600" /> Add Payment-Out</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Party *">
              <Select value={form.party_id || ""} onValueChange={v => setForm(p => ({ ...p, party_id: v }))}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date *"><Input type="date" value={form.date || ""} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="rounded-sm" /></Field>
            <Field label="Amount (₹) *"><Input type="number" step="0.01" value={form.amount || ""} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="rounded-sm font-mono-tech" /></Field>
            <Field label="Payment Type">
              <Select value={form.payment_type} onValueChange={v => setForm(p => ({ ...p, payment_type: v }))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Reference No (cheque/UPI/txn)"><Input value={form.ref_no || ""} onChange={e => setForm(p => ({ ...p, ref_no: e.target.value }))} className="rounded-sm" /></Field>
            <Field label="Bank Name"><Input value={form.bank_name || ""} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} className="rounded-sm" /></Field>
            <div className="md:col-span-2"><Field label="Notes"><Textarea rows={2} value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-sm" /></Field></div>
          </div>
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
