import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import {
  TEXT_CATEGORIES, DATE_CATEGORIES, NUM_CATEGORIES,
  matchesText, matchesDate, matchesNum,
  ColumnFilterPopover, CheckboxFilterContent, CategoryFilterContent,
} from "@/components/erp/TableFilters";
import { useColumnWidths, ColResizeHandle } from "@/components/erp/ColumnResize";
import { BookUser, Edit, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_COL_WIDTHS = { type: 110, number: 130, date: 100, total: 110, balance: 110, dueDate: 100, status: 100 };

const EMPTY_FILTERS = {
  types: [],
  statuses: [],
  number: { category: "contains", value: "" },
  date: { category: "equal", value: "" },
  dueDate: { category: "equal", value: "" },
  total: { category: "equal", value: "" },
  balance: { category: "equal", value: "" },
};

/** Core ledger content: party header + per-column-filterable transaction table. Reused by both
 * the slide-over Sheet (ViewLedgerButton, for pages keeping the classic table layout) and the
 * dual-pane PartyDualPane layout (right-hand detail panel). `kind` disambiguates the handful of
 * dual-role parties that share an id across both the customers and suppliers collections. */
export function PartyLedgerPanel({ pid, kind, onEdit, onDelete, compact }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [colWidths, startResize] = useColumnWidths("colw:party-ledger", DEFAULT_COL_WIDTHS);

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
        {kind === "supplier" && (
          <div>
            <span className="text-slate-500">Contract Expiry:</span>{" "}
            {party.contract_expiry ? fmtDate(party.contract_expiry) : "—"}
          </div>
        )}
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
          <table style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              {Object.entries(colWidths).map(([k, w]) => <col key={k} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <Th className="relative">
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
                  <ColResizeHandle onMouseDown={startResize("type")} />
                </Th>
                <Th className="relative">
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
                  <ColResizeHandle onMouseDown={startResize("number")} />
                </Th>
                <Th className="relative">
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
                  <ColResizeHandle onMouseDown={startResize("date")} />
                </Th>
                <Th className="relative text-right">
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
                  <ColResizeHandle onMouseDown={startResize("total")} />
                </Th>
                <Th className="relative text-right">
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
                  <ColResizeHandle onMouseDown={startResize("balance")} />
                </Th>
                <Th className="relative">
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
                  <ColResizeHandle onMouseDown={startResize("dueDate")} />
                </Th>
                <Th className="relative">
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
                  <ColResizeHandle onMouseDown={startResize("status")} />
                </Th>
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 ? (
                <tr><td colSpan={7}><Empty label="No transactions match the current filters." /></td></tr>
              ) : (
                txns.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td className="truncate">{t.type}</Td>
                    <Td className="font-mono-tech text-xs truncate">{t.number || "—"}</Td>
                    <Td className="truncate">{fmtDate(t.date)}</Td>
                    <Td className="text-right">{inr(t.total)}</Td>
                    <Td className="text-right">{t.balance ? inr(t.balance) : "—"}</Td>
                    <Td className="truncate">{fmtDate(t.due_date)}</Td>
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
