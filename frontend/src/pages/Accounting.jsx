import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, Card, Stat, Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { Plus, Trash2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function Accounting() {
  const [tab, setTab] = useState("gst");
  const [report, setReport] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "raw_material", payment_mode: "bank", gst_rate: 18 });

  const loadReport = async () => {
    try {
      const r = await api.get("/accounting/gst-report", { params: { period_from: from || undefined, period_to: to || undefined } });
      setReport(r.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Permission denied"); }
  };
  const loadExpenses = async () => {
    try { const r = await api.get("/expenses"); setExpenses(r.data); }
    catch (e) { toast.error("Permission denied"); }
  };
  useEffect(() => { loadReport(); loadExpenses(); }, []);

  const save = async () => {
    try {
      await api.post("/expenses", { ...form, amount: Number(form.amount)||0, gst_rate: Number(form.gst_rate)||0 });
      toast.success("Expense added"); setOpen(false); setForm({ category: "raw_material", payment_mode: "bank", gst_rate: 18 });
      loadExpenses(); loadReport();
    } catch (e) { toast.error("Failed"); }
  };
  const del = async (r) => { if (!window.confirm("Delete?")) return; await api.delete(`/expenses/${r.id}`); loadExpenses(); loadReport(); };

  return (
    <div data-testid="accounting-page">
      <PageHeader overline="Accounting" title="Accounting & GST" subtitle="GST input/output report and expense ledger. Restricted to Admin, Manager, Accountant, CA." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100 mb-4">
          <TabsTrigger value="gst" className="rounded-sm" data-testid="tab-gst">GST Report</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-sm" data-testid="tab-expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="gst">
          <Card className="p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div><Label className="text-xs uppercase">From</Label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="rounded-sm mt-1.5" /></div>
              <div><Label className="text-xs uppercase">To</Label><Input type="date" value={to} onChange={e=>setTo(e.target.value)} className="rounded-sm mt-1.5" /></div>
              <Button onClick={loadReport} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="run-gst-report"><FileSpreadsheet className="h-4 w-4 mr-1" /> Run report</Button>
            </div>
          </Card>
          {report && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Output Taxable" value={inr(report.output.taxable)} />
                <Stat label="Output GST" value={inr(report.output.total_gst)} accent="text-emerald-700" />
                <Stat label="Input GST" value={inr(report.input.total_gst)} accent="text-blue-700" />
                <Stat label="Net Liability" value={inr(report.net_liability)} accent={report.net_liability >= 0 ? "text-red-700" : "text-emerald-700"} />
              </div>
              <Card className="mt-6">
                <div className="px-5 py-3 border-b border-slate-200 font-display font-semibold">Output GST breakup</div>
                <table className="w-full">
                  <thead><tr><Th>Taxable</Th><Th>CGST</Th><Th>SGST</Th><Th>IGST</Th><Th>Total GST</Th><Th>Invoices</Th></tr></thead>
                  <tbody>
                    <tr>
                      <Td className="font-mono-tech">{inr(report.output.taxable)}</Td>
                      <Td className="font-mono-tech">{inr(report.output.cgst)}</Td>
                      <Td className="font-mono-tech">{inr(report.output.sgst)}</Td>
                      <Td className="font-mono-tech">{inr(report.output.igst)}</Td>
                      <Td className="font-mono-tech">{inr(report.output.total_gst)}</Td>
                      <Td>{report.output.invoice_count}</Td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="expenses">
          <div className="flex justify-end mb-3">
            <Button onClick={()=>setOpen(true)} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="new-expense"><Plus className="h-4 w-4 mr-1" /> New Expense</Button>
          </div>
          <Card>
            {expenses.length === 0 ? <Empty label="No expenses logged." /> : (
              <table className="w-full">
                <thead><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th>Vendor</Th><Th>Amount</Th><Th>GST</Th><Th>Total</Th><Th>Mode</Th><Th></Th></tr></thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <Td>{fmtDate(e.date)}</Td>
                      <Td className="uppercase text-xs">{e.category}</Td>
                      <Td>{e.description}</Td>
                      <Td>{e.vendor}</Td>
                      <Td className="font-mono-tech">{inr(e.amount)}</Td>
                      <Td className="font-mono-tech">{inr(e.gst_amount)}</Td>
                      <Td className="font-mono-tech font-semibold">{inr(e.total)}</Td>
                      <Td className="uppercase text-xs">{e.payment_mode}</Td>
                      <Td className="text-right"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>del(e)}><Trash2 className="h-4 w-4 text-red-600" /></Button></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-xl">
          <DialogHeader><DialogTitle className="font-display">New Expense</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date"><Input type="date" value={(form.date||"").slice(0,10)} onChange={e=>setForm(p=>({...p,date:e.target.value}))} /></Field>
            <Field label="Category">
              <Select value={form.category} onValueChange={v=>setForm(p=>({...p,category:v}))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["rent","salary","utilities","raw_material","consumable","transport","tooling","other"].map(o=>
                    <SelectItem key={o} value={o} className="capitalize">{o.replace("_"," ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="col-span-2"><Field label="Description *"><Input value={form.description||""} onChange={e=>setForm(p=>({...p,description:e.target.value}))} data-testid="expense-desc" /></Field></div>
            <Field label="Vendor"><Input value={form.vendor||""} onChange={e=>setForm(p=>({...p,vendor:e.target.value}))} /></Field>
            <Field label="Payment Mode">
              <Select value={form.payment_mode} onValueChange={v=>setForm(p=>({...p,payment_mode:v}))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{["bank","cash","upi","card"].map(o=><SelectItem key={o} value={o}>{o.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Amount (₹)"><Input type="number" value={form.amount||""} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} data-testid="expense-amount" /></Field>
            <Field label="GST %"><Input type="number" value={form.gst_rate||0} onChange={e=>setForm(p=>({...p,gst_rate:e.target.value}))} /></Field>
            <div className="col-span-2"><Field label="Notes"><Input value={form.notes||""} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} /></Field></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-expense">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
