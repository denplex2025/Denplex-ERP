import { useEffect, useState, useMemo } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Card, Th, Td, Empty, fmtDate, inr } from "@/components/erp/Primitives";
import ExportMenu from "@/components/erp/ExportMenu";
import { Plus, Undo2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SaleReturns() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), restore_inventory: true, lines: [] });

  const load = async () => {
    try {
      const r = await api.get("/sale-returns"); setRows(r.data || []);
      const c = await api.get("/customers"); setCustomers(c.data || []);
      const i = await api.get("/invoices"); setInvoices(i.data || []);
    } catch (e) { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const customerInvoices = useMemo(
    () => invoices.filter(i => i.customer_id === form.customer_id),
    [invoices, form.customer_id]
  );

  const pickInvoice = (iid) => {
    const inv = invoices.find(i => i.id === iid);
    if (!inv) return;
    setForm(p => ({
      ...p,
      original_invoice_id: inv.id,
      original_invoice_code: inv.code,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
      customer_gstin: inv.customer_gstin || "",
      lines: (inv.lines || []).map(l => ({ ...l, reason: "" })),
    }));
  };

  const setLine = (i, k, v) => setForm(p => {
    const lines = [...(p.lines || [])];
    lines[i] = { ...lines[i], [k]: v };
    return { ...p, lines };
  });
  const removeLine = (i) => setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }));

  const save = async () => {
    try {
      const cust = customers.find(c => c.id === form.customer_id);
      const payload = {
        ...form,
        customer_name: cust?.name || form.customer_name || "",
        lines: (form.lines || []).map(l => ({ ...l, qty: Number(l.qty || 0), rate: Number(l.rate || 0), gst_rate: Number(l.gst_rate || 0) })),
      };
      if (!payload.customer_id || !payload.lines?.length) { toast.error("Customer + at least one line required"); return; }
      await api.post("/sale-returns", payload);
      toast.success("Sale return recorded — credit note created");
      setOpen(false);
      setForm({ date: new Date().toISOString().slice(0, 10), restore_inventory: true, lines: [] });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const del = async (rid) => {
    if (!window.confirm("Delete this return? Credit note will also be removed.")) return;
    try { await api.delete(`/sale-returns/${rid}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <div data-testid="sale-returns-page">
      <PageHeader
        overline="Sales"
        title="Sale Returns (Credit Notes)"
        subtitle="When a customer returns goods — auto-generates a Credit Note and restores inventory."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu collection="sale-returns" />
            <Button onClick={() => setOpen(true)} className="rounded-sm bg-red-600 hover:bg-red-700">
              <Plus className="h-4 w-4 mr-1" /> New Return
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Total Returns Value</div>
          <div className="font-display text-2xl font-bold mt-1 text-amber-700">{inr(total)}</div>
          <div className="text-xs text-slate-500 mt-1">{rows.length} return(s)</div>
        </Card>
      </div>

      <Card>
        {rows.length === 0 ? <Empty label="No sale returns yet." /> : (
          <table className="w-full">
            <thead><tr><Th>Date</Th><Th>Code</Th><Th>Customer</Th><Th>Original Invoice</Th><Th>Total</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>{fmtDate(r.date)}</Td>
                  <Td className="font-mono-tech text-xs">{r.code}</Td>
                  <Td>{r.customer_name}</Td>
                  <Td className="font-mono-tech text-xs">{r.original_invoice_code || "—"}</Td>
                  <Td className="font-medium">{inr(r.total)}</Td>
                  <Td>
                    <Badge variant="outline" className={`rounded-sm uppercase text-[10px] ${r.status === "issued" ? "border-emerald-600 text-emerald-700" : "border-slate-400 text-slate-600"}`}>
                      {r.status}
                    </Badge>
                  </Td>
                  <Td>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Undo2 className="h-4 w-4 text-amber-600" /> Record Sale Return</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Customer *">
              <Select value={form.customer_id || ""} onValueChange={v => setForm(p => ({ ...p, customer_id: v, original_invoice_id: "", original_invoice_code: "", lines: [] }))}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Original Invoice (optional)">
              <Select value={form.original_invoice_id || ""} onValueChange={pickInvoice} disabled={!form.customer_id}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder={form.customer_id ? "Pick to auto-fill lines" : "Select customer first"} /></SelectTrigger>
                <SelectContent>{customerInvoices.map(i => <SelectItem key={i.id} value={i.id}>{i.code} · {inr(i.total)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date *"><Input type="date" value={form.date || ""} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="rounded-sm" /></Field>
            <Field label="Restore Inventory">
              <div className="flex items-center gap-2 h-9"><Switch checked={!!form.restore_inventory} onCheckedChange={v => setForm(p => ({ ...p, restore_inventory: v }))} /><span className="text-sm text-slate-600">Increase stock for returned items</span></div>
            </Field>
          </div>
          {form.lines?.length > 0 && (
            <div className="mt-4">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Returned Items (edit qty to partial return)</Label>
              <div className="space-y-2 mt-2">
                {form.lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-start border border-slate-200 rounded-sm p-2">
                    <div className="col-span-5"><Input value={l.description || ""} onChange={e => setLine(i, "description", e.target.value)} placeholder="Description" className="rounded-sm text-sm h-8" /></div>
                    <div className="col-span-2"><Input value={l.item_code || ""} onChange={e => setLine(i, "item_code", e.target.value)} placeholder="Item Code" className="rounded-sm text-sm h-8 font-mono-tech" /></div>
                    <div className="col-span-1"><Input type="number" value={l.qty || ""} onChange={e => setLine(i, "qty", e.target.value)} placeholder="Qty" className="rounded-sm text-sm h-8" /></div>
                    <div className="col-span-2"><Input type="number" step="0.01" value={l.rate || ""} onChange={e => setLine(i, "rate", e.target.value)} placeholder="Rate" className="rounded-sm text-sm h-8 font-mono-tech" /></div>
                    <div className="col-span-1"><Input type="number" value={l.gst_rate || ""} onChange={e => setLine(i, "gst_rate", e.target.value)} placeholder="GST%" className="rounded-sm text-sm h-8" /></div>
                    <div className="col-span-1 flex"><Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Field label="Reason for Return" className="mt-4"><Textarea rows={2} value={form.reason || ""} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} className="rounded-sm" placeholder="Damaged in transit / wrong spec / etc." /></Field>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700">Record Return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children, className = "" }) => (
  <div className={className}><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1">{children}</div></div>
);
