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
import { Plus, FileText, ArrowRightCircle, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ProformaInvoices() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), lines: [{ description: "", hsn: "", qty: 1, rate: 0, gst_rate: 18, unit: "Nos" }] });

  const load = async () => {
    try {
      const r = await api.get("/proforma-invoices"); setRows(r.data || []);
      const c = await api.get("/customers"); setCustomers(c.data || []);
    } catch (e) { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const setLine = (i, k, v) => {
    setForm(p => {
      const lines = [...(p.lines || [])];
      lines[i] = { ...lines[i], [k]: v };
      return { ...p, lines };
    });
  };
  const addLine = () => setForm(p => ({ ...p, lines: [...(p.lines || []), { description: "", hsn: "", qty: 1, rate: 0, gst_rate: 18, unit: "Nos" }] }));
  const removeLine = (i) => setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }));

  const save = async () => {
    try {
      const cust = customers.find(c => c.id === form.customer_id);
      const payload = {
        customer_id: form.customer_id,
        customer_name: cust?.name || "",
        customer_gstin: cust?.gstin || "",
        date: form.date, valid_until: form.valid_until || "",
        place_of_supply: form.place_of_supply || "",
        is_interstate: false,
        lines: (form.lines || []).map(l => ({ ...l, qty: Number(l.qty || 0), rate: Number(l.rate || 0), gst_rate: Number(l.gst_rate || 0) })),
        notes: form.notes || "",
      };
      if (!payload.customer_id || !payload.lines.length) { toast.error("Customer + at least one line required"); return; }
      await api.post("/proforma-invoices", payload);
      toast.success("Proforma created"); setOpen(false);
      setForm({ date: new Date().toISOString().slice(0, 10), lines: [{ description: "", hsn: "", qty: 1, rate: 0, gst_rate: 18, unit: "Nos" }] });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const convertToInvoice = async (pid) => {
    if (!window.confirm("Convert this proforma to a Sale Invoice?")) return;
    try {
      const r = await api.post(`/proforma-invoices/${pid}/convert`);
      toast.success(`Converted to invoice ${r.data?.invoice_code || ""}`); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const downloadPdf = async (pid, code) => {
    try {
      const r = await api.get(`/proforma-invoices/${pid}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = `${code}.pdf`; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error("PDF download failed"); }
  };
  const del = async (pid) => {
    if (!window.confirm("Delete this proforma?")) return;
    try { await api.delete(`/proforma-invoices/${pid}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <div data-testid="proforma-invoices-page">
      <PageHeader
        overline="Sales"
        title="Proforma Invoices"
        subtitle="Formal pre-invoices with terms. Convert to a Sale Invoice once the customer confirms."
        actions={<Button onClick={() => setOpen(true)} className="rounded-sm bg-red-600 hover:bg-red-700"><Plus className="h-4 w-4 mr-1" /> New Proforma</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Total Quotations</div>
          <div className="font-display text-2xl font-bold mt-1">{inr(total)}</div>
          <div className="text-xs text-slate-500 mt-1">{rows.length} proforma(s)</div>
        </Card>
      </div>

      <Card>
        {rows.length === 0 ? <Empty label="No proforma invoices yet." /> : (
          <table className="w-full">
            <thead><tr><Th>Date</Th><Th>Code</Th><Th>Customer</Th><Th>Total</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>{fmtDate(r.date)}</Td>
                  <Td className="font-mono-tech text-xs">{r.code}</Td>
                  <Td>{r.customer_name}</Td>
                  <Td className="font-medium">{inr(r.total)}</Td>
                  <Td>
                    <Badge variant="outline" className={`rounded-sm uppercase text-[10px] ${r.status === "converted" ? "border-emerald-600 text-emerald-700" : r.status === "accepted" ? "border-blue-600 text-blue-700" : r.status === "rejected" ? "border-red-600 text-red-700" : "border-slate-400 text-slate-600"}`}>
                      {r.status}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Download PDF" onClick={() => downloadPdf(r.id, r.code)}><Download className="h-3.5 w-3.5" /></Button>
                      {r.status !== "converted" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Convert to Invoice" onClick={() => convertToInvoice(r.id)}><ArrowRightCircle className="h-3.5 w-3.5 text-emerald-600" /></Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" title="Delete" onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><FileText className="h-4 w-4 text-red-600" /> New Proforma Invoice</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Customer *">
              <Select value={form.customer_id || ""} onValueChange={v => setForm(p => ({ ...p, customer_id: v }))}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date *"><Input type="date" value={form.date || ""} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="rounded-sm" /></Field>
            <Field label="Valid Until"><Input type="date" value={form.valid_until || ""} onChange={e => setForm(p => ({ ...p, valid_until: e.target.value }))} className="rounded-sm" /></Field>
            <Field label="Place of Supply"><Input value={form.place_of_supply || ""} onChange={e => setForm(p => ({ ...p, place_of_supply: e.target.value }))} className="rounded-sm" placeholder="24-Gujarat" /></Field>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Line Items</Label>
              <Button size="sm" variant="outline" className="rounded-sm h-7" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add Line</Button>
            </div>
            <div className="space-y-2">
              {form.lines?.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-1 items-start border border-slate-200 rounded-sm p-2">
                  <div className="col-span-5"><Input value={l.description || ""} onChange={e => setLine(i, "description", e.target.value)} placeholder="Description" className="rounded-sm text-sm h-8" /></div>
                  <div className="col-span-1"><Input value={l.hsn || ""} onChange={e => setLine(i, "hsn", e.target.value)} placeholder="HSN" className="rounded-sm text-sm h-8 font-mono-tech" /></div>
                  <div className="col-span-1"><Input type="number" value={l.qty || ""} onChange={e => setLine(i, "qty", e.target.value)} placeholder="Qty" className="rounded-sm text-sm h-8" /></div>
                  <div className="col-span-1"><Input value={l.unit || "Nos"} onChange={e => setLine(i, "unit", e.target.value)} placeholder="Unit" className="rounded-sm text-sm h-8" /></div>
                  <div className="col-span-2"><Input type="number" step="0.01" value={l.rate || ""} onChange={e => setLine(i, "rate", e.target.value)} placeholder="Rate" className="rounded-sm text-sm h-8 font-mono-tech" /></div>
                  <div className="col-span-1"><Input type="number" value={l.gst_rate || ""} onChange={e => setLine(i, "gst_rate", e.target.value)} placeholder="GST%" className="rounded-sm text-sm h-8" /></div>
                  <div className="col-span-1 flex items-center"><Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                </div>
              ))}
            </div>
          </div>

          <Field label="Notes" className="mt-4"><Textarea rows={2} value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-sm" /></Field>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children, className = "" }) => (
  <div className={className}><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1">{children}</div></div>
);
