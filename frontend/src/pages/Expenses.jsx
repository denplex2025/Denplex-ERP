import { useEffect, useState, useMemo } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Card, Th, Td, Empty, fmtDate, inr } from "@/components/erp/Primitives";
import ExportMenu from "@/components/erp/ExportMenu";
import { Plus, Receipt, Tag } from "lucide-react";
import { toast } from "sonner";

const PAYMENT_TYPES = ["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"];

export default function Expenses() {
  const [tab, setTab] = useState("category");
  const [cats, setCats] = useState([]);
  const [exps, setExps] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [open, setOpen] = useState(false);
  const [openCat, setOpenCat] = useState(false);
  const [form, setForm] = useState({ payment_type: "Cash", date: new Date().toISOString().slice(0, 10) });
  const [newCat, setNewCat] = useState("");

  const load = async () => {
    try {
      const c = await api.get("/expense-categories"); setCats(c.data || []);
      const e = await api.get("/expenses"); setExps(e.data || []);
      if (!selectedCat && c.data?.length) setSelectedCat(c.data[0]);
    } catch (err) { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const byCat = useMemo(() => {
    const m = {};
    cats.forEach(c => { m[c.id] = { ...c, total: 0, balance: 0 }; });
    exps.forEach(e => {
      const c = m[e.category_id]; if (!c) return;
      c.total = (c.total || 0) + Number(e.amount || 0);
      c.balance = (c.balance || 0) + Math.max(Number(e.amount || 0) - Number(e.paid_amount || 0), 0);
    });
    return Object.values(m).sort((a, b) => (b.total || 0) - (a.total || 0));
  }, [cats, exps]);

  const selectedCatExps = useMemo(
    () => exps.filter(e => e.category_id === selectedCat?.id).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [exps, selectedCat]
  );

  const saveExpense = async () => {
    try {
      const payload = { ...form, amount: Number(form.amount || 0), paid_amount: Number(form.paid_amount || 0), category_id: selectedCat?.id };
      if (!payload.amount || !payload.category_id) { toast.error("Category + amount required"); return; }
      await api.post("/expenses", payload);
      toast.success("Expense added");
      setOpen(false);
      setForm({ payment_type: "Cash", date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const saveCat = async () => {
    if (!newCat.trim()) return;
    try {
      await api.post("/expense-categories", { name: newCat.trim(), classification: "indirect" });
      toast.success("Category added");
      setOpenCat(false); setNewCat("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const totalAll = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
  const balanceAll = exps.reduce((s, e) => s + Math.max(Number(e.amount || 0) - Number(e.paid_amount || 0), 0), 0);

  return (
    <div data-testid="expenses-page">
      <PageHeader
        overline="Purchase & Expense"
        title="Expenses"
        subtitle="Track business expenses by category (Courier, Salary, Rent, etc.)."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu collection="expenses" />
            <Button onClick={() => setOpenCat(true)} variant="outline" className="rounded-sm" data-testid="add-expense-category">
              <Tag className="h-4 w-4 mr-1" /> New Category
            </Button>
            <Button onClick={() => setOpen(true)} className="rounded-sm bg-red-600 hover:bg-red-700" disabled={!selectedCat} data-testid="add-expense">
              <Plus className="h-4 w-4 mr-1" /> Add Expense
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Expenses</div>
          <div className="font-display text-2xl font-bold mt-1 text-red-700">{inr(totalAll)}</div>
          <div className="text-xs text-slate-500 mt-1">{exps.length} entries</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Unpaid Balance</div>
          <div className="font-display text-2xl font-bold mt-1 text-amber-700">{inr(balanceAll)}</div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100 mb-4">
          <TabsTrigger value="category" className="rounded-sm" data-testid="tab-category">Category</TabsTrigger>
          <TabsTrigger value="items" className="rounded-sm" data-testid="tab-items">All Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="category">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">Category</div>
                <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">Amount</div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {byCat.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCat(c)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedCat?.id === c.id ? "bg-red-50" : ""}`}
                  >
                    <span className="text-sm text-slate-800">{c.name}</span>
                    <span className="text-sm font-medium font-mono-tech">{(c.total || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="lg:col-span-2">
              {selectedCat ? (
                <>
                  <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-slate-500">{selectedCat.classification}</div>
                      <div className="font-display text-lg font-semibold mt-0.5">{selectedCat.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Total : <strong>{inr(selectedCatExps.reduce((s, e) => s + Number(e.amount || 0), 0))}</strong></div>
                      <div className="text-xs text-slate-500">Balance : <strong>{inr(selectedCatExps.reduce((s, e) => s + Math.max(Number(e.amount || 0) - Number(e.paid_amount || 0), 0), 0))}</strong></div>
                    </div>
                  </div>
                  {selectedCatExps.length === 0 ? <Empty label="No expenses in this category." /> : (
                    <table className="w-full">
                      <thead><tr><Th>Date</Th><Th>Exp No.</Th><Th>Party</Th><Th>Payment Type</Th><Th>Amount</Th><Th>Balance</Th><Th>Status</Th></tr></thead>
                      <tbody>
                        {selectedCatExps.map(e => (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <Td>{fmtDate(e.date)}</Td>
                            <Td className="font-mono-tech text-xs">{e.code}</Td>
                            <Td>{e.party_name || "—"}</Td>
                            <Td>{e.payment_type}</Td>
                            <Td className="font-medium">{inr(e.amount)}</Td>
                            <Td>{inr(Math.max(Number(e.amount || 0) - Number(e.paid_amount || 0), 0))}</Td>
                            <Td><Badge variant="outline" className={`rounded-sm uppercase text-[10px] ${e.status === "Paid" ? "border-emerald-600 text-emerald-700" : e.status === "Partial" ? "border-amber-600 text-amber-700" : "border-red-600 text-red-700"}`}>{e.status}</Badge></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : <Empty label="No category selected." />}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="items">
          <Card>
            {exps.length === 0 ? <Empty label="No expenses recorded yet." /> : (
              <table className="w-full">
                <thead><tr><Th>Date</Th><Th>Exp No.</Th><Th>Category</Th><Th>Party</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {[...exps].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(e => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <Td>{fmtDate(e.date)}</Td>
                      <Td className="font-mono-tech text-xs">{e.code}</Td>
                      <Td>{e.category_name || "—"}</Td>
                      <Td>{e.party_name || "—"}</Td>
                      <Td className="font-medium">{inr(e.amount)}</Td>
                      <Td><Badge variant="outline" className="rounded-sm uppercase text-[10px]">{e.status}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Expense dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-lg">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Receipt className="h-4 w-4 text-red-600" /> Add Expense — {selectedCat?.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Date *"><Input type="date" value={form.date || ""} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="rounded-sm" /></Field>
            <Field label="Amount (₹) *"><Input type="number" step="0.01" value={form.amount || ""} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="rounded-sm font-mono-tech" /></Field>
            <Field label="Paid Amount (₹)"><Input type="number" step="0.01" value={form.paid_amount || ""} onChange={e => setForm(p => ({ ...p, paid_amount: e.target.value }))} className="rounded-sm font-mono-tech" /></Field>
            <Field label="Payment Type">
              <Select value={form.payment_type} onValueChange={v => setForm(p => ({ ...p, payment_type: v }))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Reference No"><Input value={form.ref_no || ""} onChange={e => setForm(p => ({ ...p, ref_no: e.target.value }))} className="rounded-sm" /></Field>
            <Field label="Party (optional)"><Input value={form.party_name || ""} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))} className="rounded-sm" /></Field>
            <div className="md:col-span-2"><Field label="Notes"><Textarea rows={2} value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-sm" /></Field></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={saveExpense} className="rounded-sm bg-red-600 hover:bg-red-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Category dialog */}
      <Dialog open={openCat} onOpenChange={setOpenCat}>
        <DialogContent className="rounded-sm max-w-sm">
          <DialogHeader><DialogTitle className="font-display">New Expense Category</DialogTitle></DialogHeader>
          <Field label="Category Name"><Input value={newCat} onChange={e => setNewCat(e.target.value)} className="rounded-sm" placeholder="e.g. Stationery" /></Field>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpenCat(false)}>Cancel</Button>
            <Button onClick={saveCat} className="rounded-sm bg-red-600 hover:bg-red-700">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1">{children}</div></div>
);
