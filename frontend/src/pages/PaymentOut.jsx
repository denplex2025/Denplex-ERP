import { useEffect, useMemo, useState } from "react";
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
import AttachmentsPopover from "@/components/erp/AttachmentsPopover";
import {
  TEXT_CATEGORIES, DATE_CATEGORIES, NUM_CATEGORIES,
  matchesText, matchesDate, matchesNum,
  ColumnFilterPopover, CheckboxFilterContent, CategoryFilterContent,
} from "@/components/erp/TableFilters";
import { useColumnWidths, ColResizeHandle } from "@/components/erp/ColumnResize";
import FYFilter from "@/components/erp/FYFilter";
import { currentFYLabel, currentFYRange } from "@/lib/fiscalYear";
import { Plus, ArrowUpFromLine, Search, Printer } from "lucide-react";
import { toast } from "sonner";

const PAYMENT_TYPES = ["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"];
const STATUSES = ["Unused", "Partially Used", "Used"];
const n = (v) => Number(v || 0);

const DEFAULT_COL_WIDTHS = { date: 110, code: 120, party: 220, amount: 120, paidVia: 170, status: 130, attach: 60 };
const EMPTY_FILTERS = {
  code: { category: "contains", value: "" },
  party: { category: "contains", value: "" },
  date: { category: "equal", value: "" },
  amount: { category: "equal", value: "" },
  paymentTypes: [],
  statuses: [],
};

export default function PaymentOut() {
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ payment_type: "Cash", date: new Date().toISOString().slice(0, 10) });
  const [openBills, setOpenBills] = useState([]);
  const [allocs, setAllocs] = useState({});   // billId -> { amount, tds }
  const [advance, setAdvance] = useState("");

  // Filters: FY/date range (defaults to current FY, same convention as every other report in the
  // ERP) + free-text search + per-column filters (Vyapar-style funnel popovers), matching the
  // pattern already established in PurchaseBills.jsx / PaymentIn.jsx.
  const [fy, setFy] = useState(currentFYLabel());
  const [dateFrom, setDateFrom] = useState(currentFYRange().from);
  const [dateTo, setDateTo] = useState(currentFYRange().to);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [colWidths, startResize] = useColumnWidths("colw:payments-out", DEFAULT_COL_WIDTHS);

  const load = async () => {
    try {
      const r = await api.get("/payments-out"); setRows(r.data || []);
      const c = await api.get("/suppliers"); setSuppliers(c.data || []);
    } catch (e) { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const pickParty = async (party_id) => {
    setForm(p => ({ ...p, party_id }));
    setAllocs({}); setOpenBills([]); setAdvance("");
    try { const r = await api.get(`/payments-out/open-bills/${party_id}`); setOpenBills(r.data || []); }
    catch (e) { /* supplier may have no bills */ }
  };

  const setAlloc = (id, key, val) => setAllocs(a => ({ ...a, [id]: { ...(a[id] || {}), [key]: val } }));
  const settleRow = (b) => setAlloc(b.id, "amount", b.outstanding);

  const allocAmount = Object.values(allocs).reduce((s, a) => s + n(a.amount), 0);
  const allocTds = Object.values(allocs).reduce((s, a) => s + n(a.tds), 0);
  const totalPaid = allocAmount + n(advance);

  const resetForm = () => { setForm({ payment_type: "Cash", date: new Date().toISOString().slice(0, 10) }); setAllocs({}); setOpenBills([]); setAdvance(""); };

  const save = async () => {
    const sup = suppliers.find(c => c.id === form.party_id);
    if (!form.party_id) { toast.error("Select a supplier"); return; }
    const allocations = openBills
      .filter(b => n(allocs[b.id]?.amount) > 0 || n(allocs[b.id]?.tds) > 0)
      .map(b => ({ document_id: b.id, document_code: b.code, document_type: "vendor_bill", amount: n(allocs[b.id]?.amount), tds_amount: n(allocs[b.id]?.tds) }));
    const amount = allocations.length ? totalPaid : n(form.amount);
    if (!amount && !allocTds) { toast.error("Enter an amount or allocate to a bill"); return; }
    for (const b of openBills) {
      const a = allocs[b.id]; if (!a) continue;
      if (n(a.amount) + n(a.tds) > b.outstanding + 0.01) { toast.error(`${b.code}: amount + TDS exceeds outstanding ${inr(b.outstanding)}`); return; }
    }
    try {
      const payload = { ...form, party_name: sup?.name || "", amount, allocations };
      await api.post("/payments-out", payload);
      toast.success("Payment recorded");
      setOpen(false); resetForm(); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  // Date-range slice first (drives the summary cards + is independent of the free-text/column
  // filters below), then search + per-column filters on top — same two-stage approach as
  // PurchaseBills.jsx / PaymentIn.jsx.
  const baseFiltered = useMemo(() => rows.filter((r) => {
    const d = (r.date || "").slice(0, 10);
    if (dateFrom && d && d < dateFrom) return false;
    if (dateTo && d && d > dateTo) return false;
    return true;
  }), [rows, dateFrom, dateTo]);

  const q = search.trim().toLowerCase();
  const filteredRows = useMemo(() => baseFiltered.filter((r) => {
    if (q && !((r.code || "").toLowerCase().includes(q) || (r.party_name || "").toLowerCase().includes(q))) return false;
    if (filters.statuses.length && !filters.statuses.includes(r.status || "Unused")) return false;
    if (filters.paymentTypes.length && !filters.paymentTypes.includes(r.payment_type)) return false;
    if (!matchesText(r.code, filters.code)) return false;
    if (!matchesText(r.party_name, filters.party)) return false;
    if (!matchesDate(r.date, filters.date)) return false;
    if (!matchesNum(r.amount, filters.amount)) return false;
    return true;
  }), [baseFiltered, q, filters]);

  const hasActiveFilters = filters.statuses.length > 0 || filters.paymentTypes.length > 0 || !!filters.code.value
    || !!filters.party.value || !!filters.date.value || filters.amount.value !== "";

  const total = filteredRows.reduce((s, r) => s + n(r.amount), 0);
  const available = filteredRows.reduce((s, r) => s + Math.max(0, n(r.amount) - n(r.allocated_amount)), 0);

  return (
    <div data-testid="payments-out-page">
      <PageHeader
        overline="Purchase & Expense"
        title="Payment-Out"
        subtitle="Money paid to suppliers — settle bills and adjust TDS you deduct at source."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu collection="payments-out" />
            <Button onClick={() => { resetForm(); setOpen(true); }} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="add-payment-out">
              <Plus className="h-4 w-4 mr-1" /> Add Payment-Out
            </Button>
          </div>
        }
      />

      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Filter by:</span>
          <FYFilter value={fy} onChange={({ value, from, to }) => { setFy(value); setDateFrom(from || ""); setDateTo(to || ""); }} />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-sm h-8 w-36 text-xs" />
          <span className="text-slate-400 text-xs">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-sm h-8 w-36 text-xs" />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Paid</div>
          <div className="font-display text-2xl font-bold mt-1 text-red-700">{inr(total)}</div>
          <div className="text-xs text-slate-500 mt-1">{filteredRows.length} payment(s) in range</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Available Credit (Unused)</div>
          <div className="font-display text-2xl font-bold mt-1 text-amber-700">{inr(available)}</div>
          <div className="text-xs text-slate-500 mt-1">Not yet allocated to a bill</div>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <Input placeholder="Search ref. no or party…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-sm border-slate-300 pl-8 h-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-red-600 hover:underline">Clear column filters</button>
          )}
          <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" /> Print</Button>
        </div>
      </div>

      <Card>
        {filteredRows.length === 0 ? <Empty label={rows.length === 0 ? "No payments made yet." : "No payments match the current filters."} /> : (
          <div className="overflow-x-auto">
            <table style={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup>{Object.entries(colWidths).map(([k, w]) => <col key={k} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr>
                  <Th className="relative"><div className="flex items-center gap-1">Date
                    <ColumnFilterPopover active={!!filters.date.value} renderContent={(close) => (
                      <CategoryFilterContent categoryOptions={DATE_CATEGORIES} inputType="date" valueLabel="Select Date" committed={filters.date}
                        onApply={(v) => setFilters((f) => ({ ...f, date: v }))} onClear={() => setFilters((f) => ({ ...f, date: { category: "equal", value: "" } }))} close={close} />
                    )} />
                  </div><ColResizeHandle onMouseDown={startResize("date")} /></Th>
                  <Th className="relative"><div className="flex items-center gap-1">Ref.
                    <ColumnFilterPopover active={!!filters.code.value} renderContent={(close) => (
                      <CategoryFilterContent categoryOptions={TEXT_CATEGORIES} inputType="text" valueLabel="Ref. No" committed={filters.code}
                        onApply={(v) => setFilters((f) => ({ ...f, code: v }))} onClear={() => setFilters((f) => ({ ...f, code: { category: "contains", value: "" } }))} close={close} />
                    )} />
                  </div><ColResizeHandle onMouseDown={startResize("code")} /></Th>
                  <Th className="relative"><div className="flex items-center gap-1">Party Name
                    <ColumnFilterPopover active={!!filters.party.value} renderContent={(close) => (
                      <CategoryFilterContent categoryOptions={TEXT_CATEGORIES} inputType="text" valueLabel="Party Name" committed={filters.party}
                        onApply={(v) => setFilters((f) => ({ ...f, party: v }))} onClear={() => setFilters((f) => ({ ...f, party: { category: "contains", value: "" } }))} close={close} />
                    )} />
                  </div><ColResizeHandle onMouseDown={startResize("party")} /></Th>
                  <Th className="relative text-right"><div className="flex items-center justify-end gap-1">Amount
                    <ColumnFilterPopover active={filters.amount.value !== ""} renderContent={(close) => (
                      <CategoryFilterContent categoryOptions={NUM_CATEGORIES} inputType="number" valueLabel="Amount" committed={filters.amount}
                        onApply={(v) => setFilters((f) => ({ ...f, amount: v }))} onClear={() => setFilters((f) => ({ ...f, amount: { category: "equal", value: "" } }))} close={close} />
                    )} />
                  </div><ColResizeHandle onMouseDown={startResize("amount")} /></Th>
                  <Th className="relative"><div className="flex items-center gap-1">Paid via
                    <ColumnFilterPopover active={filters.paymentTypes.length > 0} renderContent={(close) => (
                      <CheckboxFilterContent options={PAYMENT_TYPES} committed={filters.paymentTypes}
                        onApply={(v) => setFilters((f) => ({ ...f, paymentTypes: v }))} onClear={() => setFilters((f) => ({ ...f, paymentTypes: [] }))} close={close} />
                    )} />
                  </div><ColResizeHandle onMouseDown={startResize("paidVia")} /></Th>
                  <Th className="relative"><div className="flex items-center gap-1">Status
                    <ColumnFilterPopover active={filters.statuses.length > 0} renderContent={(close) => (
                      <CheckboxFilterContent options={STATUSES} committed={filters.statuses}
                        onApply={(v) => setFilters((f) => ({ ...f, statuses: v }))} onClear={() => setFilters((f) => ({ ...f, statuses: [] }))} close={close} />
                    )} />
                  </div><ColResizeHandle onMouseDown={startResize("status")} /></Th>
                  <Th className="text-center">Attach</Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td className="truncate">{fmtDate(r.date)}</Td>
                    <Td className="font-mono-tech text-xs truncate">{r.code}</Td>
                    <Td className="truncate">{r.party_name}</Td>
                    <Td className="text-right font-medium font-mono-tech">{inr(r.amount)}</Td>
                    <Td className="truncate">{r.payment_type}{r.ref_no ? ` · ${r.ref_no}` : ""}</Td>
                    <Td>
                      <Badge variant="outline" className={`rounded-sm uppercase text-[10px] ${r.status === "Used" ? "border-emerald-600 text-emerald-700" : r.status === "Partially Used" ? "border-amber-600 text-amber-700" : "border-slate-400 text-slate-600"}`}>
                        {r.status}
                      </Badge>
                    </Td>
                    <Td className="text-center">
                      <AttachmentsPopover linkedTo={r.id} linkedType="payment_out" category="payment" label="Receipt / Proof" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4 text-red-600" /> Add Payment-Out</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Party *">
              <Select value={form.party_id || ""} onValueChange={pickParty}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
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

          {form.party_id && (
            <div className="mt-3">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Apply to purchase bills</Label>
              {openBills.length === 0 ? (
                <div className="text-sm text-slate-400 mt-1 border border-dashed border-slate-200 rounded-sm p-3">No open bills for this supplier — record as advance below.</div>
              ) : (
                <div className="mt-1 border border-slate-200 rounded-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="p-2">Bill</th><th className="p-2 text-right">Outstanding</th><th className="p-2 w-28">Amount Paid</th><th className="p-2 w-24">TDS Deducted</th><th className="p-2 w-14"></th>
                    </tr></thead>
                    <tbody>
                      {openBills.map(b => {
                        const a = allocs[b.id] || {};
                        const left = b.outstanding - n(a.amount) - n(a.tds);
                        return (
                          <tr key={b.id} className="border-t border-slate-100">
                            <td className="p-2"><div className="font-mono-tech text-xs">{b.code}</div><div className="text-[10px] text-slate-400">{fmtDate(b.date)}</div></td>
                            <td className="p-2 text-right font-mono-tech">{inr(b.outstanding)}</td>
                            <td className="p-2"><Input type="number" value={a.amount || ""} onChange={e => setAlloc(b.id, "amount", e.target.value)} className="h-8 rounded-sm text-right" placeholder="0" /></td>
                            <td className="p-2"><Input type="number" value={a.tds || ""} onChange={e => setAlloc(b.id, "tds", e.target.value)} className="h-8 rounded-sm text-right" placeholder="0" /></td>
                            <td className="p-2 text-center">
                              <button onClick={() => settleRow(b)} className="text-[10px] text-red-600 hover:underline" title="Fill full outstanding as amount">full</button>
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
              <div className="text-xs text-slate-500">Amount paid <strong className="text-slate-900 font-mono-tech">{inr(totalPaid)}</strong></div>
              {allocTds > 0 && <div className="text-xs text-slate-500">TDS adjusted <strong className="text-amber-700 font-mono-tech">{inr(allocTds)}</strong></div>}
            </div>
          </div>
          <div className="mt-2"><Field label="Notes"><Textarea rows={2} value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-sm" /></Field></div>
          <p className="text-xs text-slate-400 mt-1">Tip: after saving, use the paperclip icon on the row to attach a receipt, cheque scan, or UPI screenshot.</p>

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
