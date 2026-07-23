import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import { BookUser, Edit, Trash2, Filter, X } from "lucide-react";
import { toast } from "sonner";

const TEXT_CATEGORIES = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "starts_with", label: "Starts with" },
];
const DATE_CATEGORIES = [
  { value: "equal", label: "Equal To" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
];
const NUM_CATEGORIES = [
  { value: "equal", label: "Equal to" },
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
];

const EMPTY_FILTERS = {
  types: [],
  statuses: [],
  number: { category: "contains", value: "" },
  date: { category: "equal", value: "" },
  dueDate: { category: "equal", value: "" },
  total: { category: "equal", value: "" },
  balance: { category: "equal", value: "" },
};

function matchesText(fieldVal, f) {
  if (!f.value) return true;
  const v = String(fieldVal || "").toLowerCase();
  const needle = f.value.toLowerCase();
  if (f.category === "equals") return v === needle;
  if (f.category === "starts_with") return v.startsWith(needle);
  return v.includes(needle);
}
function matchesDate(fieldVal, f) {
  if (!f.value) return true;
  if (!fieldVal) return false;
  const d = String(fieldVal).slice(0, 10);
  if (f.category === "before") return d < f.value;
  if (f.category === "after") return d > f.value;
  return d === f.value;
}
function matchesNum(fieldVal, f) {
  if (f.value === "" || f.value == null) return true;
  const n = Number(fieldVal || 0);
  const v = Number(f.value);
  if (Number.isNaN(v)) return true;
  if (f.category === "gt") return n > v;
  if (f.category === "lt") return n < v;
  return n === v;
}

/** Small funnel icon in a column header that opens a filter popover, matching the per-column
 * filter pattern (checkbox list or category+value) used throughout Vyapar's transaction tables. */
function ColumnFilterPopover({ active, renderContent }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex ml-1 ${active ? "text-red-600" : "text-slate-400 hover:text-slate-600"}`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 rounded-sm" onClick={(e) => e.stopPropagation()}>
        {renderContent(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

function CheckboxFilterContent({ options, committed, onApply, onClear, close }) {
  const [draft, setDraft] = useState(committed);
  const toggle = (v) => setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  return (
    <div className="space-y-2">
      {options.length === 0 ? (
        <div className="text-xs text-slate-400">No values to filter.</div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={draft.includes(o)} onCheckedChange={() => toggle(o)} />
              <span className="truncate">{o}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="rounded-sm flex-1 h-7 text-xs" onClick={() => { onClear(); close(); }}>Clear</Button>
        <Button type="button" size="sm" className="rounded-sm flex-1 h-7 text-xs bg-red-600 hover:bg-red-700" onClick={() => { onApply(draft); close(); }}>Apply</Button>
      </div>
    </div>
  );
}

function CategoryFilterContent({ categoryOptions, inputType, valueLabel, committed, onApply, onClear, close }) {
  const [category, setCategory] = useState(committed.category);
  const [val, setVal] = useState(committed.value);
  return (
    <div className="space-y-2.5">
      <div>
        <Label className="text-xs text-slate-500">Select Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="rounded-sm h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categoryOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-slate-500">{valueLabel}</Label>
        <Input type={inputType} value={val} onChange={(e) => setVal(e.target.value)} className="rounded-sm h-8 text-sm mt-1" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="rounded-sm flex-1 h-7 text-xs" onClick={() => { onClear(); close(); }}>Clear</Button>
        <Button type="button" size="sm" className="rounded-sm flex-1 h-7 text-xs bg-red-600 hover:bg-red-700" onClick={() => { onApply({ category, value: val }); close(); }}>Apply</Button>
      </div>
    </div>
  );
}

/** Core ledger content: party header + per-column-filterable transaction table. Reused by both
 * the slide-over Sheet (ViewLedgerButton, for pages keeping the classic table layout) and the
 * dual-pane PartyDualPane layout (right-hand detail panel). `kind` disambiguates the handful of
 * dual-role parties that share an id across both the customers and suppliers collections. */
export function PartyLedgerPanel({ pid, kind, onEdit, onDelete, compact }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => {
    if (!pid) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setFilters(EMPTY_FILTERS);
    api.get(`/parties/${pid}/transactions`, { params: kind ? { kind } : {} })
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) toast.error("Failed to load party ledger"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pid, kind]);

  const party = data?.party;
  const allTxns = data?.transactions || [];

  const typeOptions = useMemo(() => [...new Set(allTxns.map((t) => t.type))], [allTxns]);
  const statusOptions = useMemo(() => [...new Set(allTxns.map((t) => t.status).filter(Boolean))], [allTxns]);

  const txns = useMemo(() => allTxns.filter((t) => {
    if (filters.types.length && !filters.types.includes(t.type)) return false;
    if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
    if (!matchesText(t.number, filters.number)) return false;
    if (!matchesDate(t.date, filters.date)) return false;
    if (!matchesDate(t.due_date, filters.dueDate)) return false;
    if (!matchesNum(t.total, filters.total)) return false;
    if (!matchesNum(t.balance, filters.balance)) return false;
    return true;
  }), [allTxns, filters]);

  const totalOutstanding = txns.reduce((s, t) => {
    const sign = t.type.startsWith("Payment") || t.type.includes("Return") ? -1 : 1;
    return s + sign * (t.balance || 0);
  }, 0);

  const hasActiveFilters = filters.types.length > 0 || filters.statuses.length > 0
    || !!filters.number.value || !!filters.date.value || !!filters.dueDate.value
    || filters.total.value !== "" || filters.balance.value !== "";

  const clearAll = () => setFilters(EMPTY_FILTERS);

  if (!pid) return <Empty label="Select a party on the left to view their ledger." />;
  if (loading) return <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>;
  if (!data) return <Empty label="Could not load party details." />;

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-display text-xl font-bold text-slate-900">{party.name}</div>
          {kind && <div className="text-xs uppercase tracking-wider text-slate-500 mt-0.5">{kind === "supplier" ? "Supplier" : "Customer"}</div>}
        </div>
        {(onEdit || onDelete) && (
          <div className="flex gap-1 shrink-0">
            {onEdit && <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => onEdit(party)} data-testid="ledger-edit-party"><Edit className="h-4 w-4" /></Button>}
            {onDelete && <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => onDelete(party)} data-testid="ledger-delete-party"><Trash2 className="h-4 w-4 text-red-600" /></Button>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 border border-slate-200 rounded-sm p-4">
        <div><span className="text-slate-500">GSTIN:</span> {party.gstin || "—"}</div>
        <div><span className="text-slate-500">Phone:</span> {party.phone || "—"}</div>
        <div><span className="text-slate-500">Contact:</span> {party.contact_person || "—"}</div>
        <div><span className="text-slate-500">Email:</span> {party.email || "—"}</div>
        <div className="col-span-2"><span className="text-slate-500">Address:</span> {party.address || "—"}</div>
        <div className="col-span-2 pt-2 border-t border-slate-200 mt-1">
          <span className="text-slate-500">Net Outstanding{hasActiveFilters ? " (filtered)" : ""}:</span>{" "}
          <span className={`font-display font-bold ${totalOutstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {inr(Math.abs(totalOutstanding))} {totalOutstanding > 0 ? "receivable" : totalOutstanding < 0 ? "advance/credit" : ""}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Transaction History ({txns.length}{txns.length !== allTxns.length ? ` of ${allTxns.length}` : ""})
        </div>
        {hasActiveFilters && (
          <button onClick={clearAll} className="text-xs text-red-600 hover:underline flex items-center gap-0.5">
            <X className="h-3 w-3" /> Clear all filters
          </button>
        )}
      </div>

      {allTxns.length === 0 ? (
        <Empty label="No transactions yet." />
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-sm">
          <table className="w-full">
            <thead>
              <tr>
                <Th>
                  <div className="flex items-center gap-1">
                    Type
                    <ColumnFilterPopover
                      active={filters.types.length > 0}
                      renderContent={(close) => (
                        <CheckboxFilterContent
                          options={typeOptions}
                          committed={filters.types}
                          onApply={(v) => setFilters((f) => ({ ...f, types: v }))}
                          onClear={() => setFilters((f) => ({ ...f, types: [] }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                </Th>
                <Th>
                  <div className="flex items-center gap-1">
                    Number
                    <ColumnFilterPopover
                      active={!!filters.number.value}
                      renderContent={(close) => (
                        <CategoryFilterContent
                          categoryOptions={TEXT_CATEGORIES}
                          inputType="text"
                          valueLabel="Number"
                          committed={filters.number}
                          onApply={(v) => setFilters((f) => ({ ...f, number: v }))}
                          onClear={() => setFilters((f) => ({ ...f, number: { category: "contains", value: "" } }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                </Th>
                <Th>
                  <div className="flex items-center gap-1">
                    Date
                    <ColumnFilterPopover
                      active={!!filters.date.value}
                      renderContent={(close) => (
                        <CategoryFilterContent
                          categoryOptions={DATE_CATEGORIES}
                          inputType="date"
                          valueLabel="Select Date"
                          committed={filters.date}
                          onApply={(v) => setFilters((f) => ({ ...f, date: v }))}
                          onClear={() => setFilters((f) => ({ ...f, date: { category: "equal", value: "" } }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                </Th>
                <Th className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    Total
                    <ColumnFilterPopover
                      active={filters.total.value !== ""}
                      renderContent={(close) => (
                        <CategoryFilterContent
                          categoryOptions={NUM_CATEGORIES}
                          inputType="number"
                          valueLabel="Total"
                          committed={filters.total}
                          onApply={(v) => setFilters((f) => ({ ...f, total: v }))}
                          onClear={() => setFilters((f) => ({ ...f, total: { category: "equal", value: "" } }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                </Th>
                <Th className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    Balance
                    <ColumnFilterPopover
                      active={filters.balance.value !== ""}
                      renderContent={(close) => (
                        <CategoryFilterContent
                          categoryOptions={NUM_CATEGORIES}
                          inputType="number"
                          valueLabel="Balance"
                          committed={filters.balance}
                          onApply={(v) => setFilters((f) => ({ ...f, balance: v }))}
                          onClear={() => setFilters((f) => ({ ...f, balance: { category: "equal", value: "" } }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                </Th>
                <Th>
                  <div className="flex items-center gap-1">
                    Due Date
                    <ColumnFilterPopover
                      active={!!filters.dueDate.value}
                      renderContent={(close) => (
                        <CategoryFilterContent
                          categoryOptions={DATE_CATEGORIES}
                          inputType="date"
                          valueLabel="Select Date"
                          committed={filters.dueDate}
                          onApply={(v) => setFilters((f) => ({ ...f, dueDate: v }))}
                          onClear={() => setFilters((f) => ({ ...f, dueDate: { category: "equal", value: "" } }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                </Th>
                <Th>
                  <div className="flex items-center gap-1">
                    Status
                    <ColumnFilterPopover
                      active={filters.statuses.length > 0}
                      renderContent={(close) => (
                        <CheckboxFilterContent
                          options={statusOptions}
                          committed={filters.statuses}
                          onApply={(v) => setFilters((f) => ({ ...f, statuses: v }))}
                          onClear={() => setFilters((f) => ({ ...f, statuses: [] }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                </Th>
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 ? (
                <tr><td colSpan={7}><Empty label="No transactions match the current filters." /></td></tr>
              ) : (
                txns.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td>{t.type}</Td>
                    <Td className="font-mono-tech text-xs">{t.number || "—"}</Td>
                    <Td>{fmtDate(t.date)}</Td>
                    <Td className="text-right">{inr(t.total)}</Td>
                    <Td className="text-right">{t.balance ? inr(t.balance) : "—"}</Td>
                    <Td>{fmtDate(t.due_date)}</Td>
                    <Td>{t.status ? <StatusBadge status={t.status} /> : "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Per-row "View Ledger" trigger button for CrudPage rowActions (slide-over version). Kept for
 * any page that still uses the classic single-pane table layout instead of PartyDualPane. */
export function ViewLedgerButton({ row, kind }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="rounded-sm h-8 w-8"
        title="View Ledger"
        data-testid={`row-ledger-${row.id}`}
        onClick={() => setOpen(true)}
      >
        <BookUser className="h-4 w-4 text-slate-600" />
      </Button>
      {open && <PartyLedgerSheet pid={row.id} kind={kind} open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function PartyLedgerSheet({ pid, kind, open, onOpenChange }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none w-full sm:max-w-3xl overflow-y-auto" data-testid="party-ledger-sheet">
        <SheetHeader>
          <SheetTitle className="font-display tracking-tight">Party Details</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <PartyLedgerPanel pid={open ? pid : null} kind={kind} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
