import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import {
  TEXT_CATEGORIES, DATE_CATEGORIES, NUM_CATEGORIES,
  matchesText, matchesDate, matchesNum,
  ColumnFilterPopover, CheckboxFilterContent, CategoryFilterContent,
} from "@/components/erp/TableFilters";
import { useColumnWidths, ColResizeHandle } from "@/components/erp/ColumnResize";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, SlidersHorizontal, QrCode, Edit, Trash2, X, Boxes } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_COL_WIDTHS = { type: 130, number: 130, date: 100, quantity: 100, price: 110, status: 110 };

const EMPTY_FILTERS = {
  types: [],
  statuses: [],
  number: { category: "contains", value: "" },
  date: { category: "equal", value: "" },
  quantity: { category: "equal", value: "" },
  price: { category: "equal", value: "" },
};

/** Item-detail right-hand panel for the Items dual-pane layout, mirroring PartyLedgerPanel's
 * pattern: header stats + a per-column-filterable transaction table (merged StockMovement +
 * StockAdjustment rows), plus a read-only "used in BOM(s)" summary. Items with no BOM linkage at
 * all just show a normal empty state here — linkage is optional, never required. */
export function ItemLedgerPanel({ itemId, onStockIn, onStockOut, onTransfer, onAdjust, onQr, onEdit, onDelete }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [colWidths, startResize] = useColumnWidths("colw:item-ledger", DEFAULT_COL_WIDTHS);

  useEffect(() => {
    if (!itemId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setFilters(EMPTY_FILTERS);
    api.get(`/inventory/items/${itemId}/ledger`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) toast.error("Failed to load item ledger"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId]);

  const item = data?.item;
  const allTxns = data?.transactions || [];
  const usedInBoms = data?.used_in_boms || [];

  const typeOptions = useMemo(() => [...new Set(allTxns.map((t) => t.type))], [allTxns]);
  const statusOptions = useMemo(() => [...new Set(allTxns.map((t) => t.status).filter(Boolean))], [allTxns]);

  const txns = useMemo(() => allTxns.filter((t) => {
    if (filters.types.length && !filters.types.includes(t.type)) return false;
    if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
    if (!matchesText(t.number, filters.number)) return false;
    if (!matchesDate(t.date, filters.date)) return false;
    if (!matchesNum(t.quantity, filters.quantity)) return false;
    if (!matchesNum(t.price_per_unit, filters.price)) return false;
    return true;
  }), [allTxns, filters]);

  const hasActiveFilters = filters.types.length > 0 || filters.statuses.length > 0
    || !!filters.number.value || !!filters.date.value
    || filters.quantity.value !== "" || filters.price.value !== "";

  const clearAll = () => setFilters(EMPTY_FILTERS);

  if (!itemId) return <Empty label="Select an item on the left to view its details." />;
  if (loading) return <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>;
  if (!data) return <Empty label="Could not load item details." />;

  const stockValue = (item.qty_on_hand || 0) * (item.unit_cost || 0);
  const byLocation = Object.entries(item.qty_by_location || {}).filter(([, q]) => q);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display text-xl font-bold text-slate-900">{item.name}</div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mt-0.5 font-mono-tech">{item.sku}</div>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap">
          {onStockIn && <Button size="sm" variant="outline" className="rounded-sm h-8 text-xs" onClick={() => onStockIn(item)} data-testid="item-stock-in"><ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> In</Button>}
          {onStockOut && <Button size="sm" variant="outline" className="rounded-sm h-8 text-xs" onClick={() => onStockOut(item)} data-testid="item-stock-out"><ArrowUpFromLine className="h-3.5 w-3.5 mr-1" /> Out</Button>}
          {onTransfer && <Button size="sm" variant="outline" className="rounded-sm h-8 text-xs" onClick={() => onTransfer(item)} data-testid="item-transfer"><ArrowLeftRight className="h-3.5 w-3.5 mr-1" /> Transfer</Button>}
          {onAdjust && <Button size="sm" variant="outline" className="rounded-sm h-8 text-xs" onClick={() => onAdjust(item)} data-testid="item-adjust"><SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Adjust</Button>}
          {onQr && <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => onQr(item)} data-testid="item-qr"><QrCode className="h-4 w-4" /></Button>}
          {onEdit && <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => onEdit(item)} data-testid="item-edit"><Edit className="h-4 w-4" /></Button>}
          {onDelete && <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => onDelete(item)} data-testid="item-delete"><Trash2 className="h-4 w-4 text-red-600" /></Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm bg-slate-50 border border-slate-200 rounded-sm p-4">
        <div><span className="text-slate-500 block text-xs uppercase tracking-wider">On Hand</span> {item.qty_on_hand} {item.uom}</div>
        <div><span className="text-slate-500 block text-xs uppercase tracking-wider">In Process</span> {item.qty_in_process || 0} {item.uom}</div>
        <div><span className="text-slate-500 block text-xs uppercase tracking-wider">Reorder Level</span> {item.reorder_level || 0} {item.uom}</div>
        <div><span className="text-slate-500 block text-xs uppercase tracking-wider">Stock Value</span> <span className="font-display font-bold">{inr(stockValue)}</span></div>
        <div><span className="text-slate-500 block text-xs uppercase tracking-wider">Unit Cost</span> {inr(item.unit_cost)}</div>
        <div><span className="text-slate-500 block text-xs uppercase tracking-wider">Sale Price</span> {inr(item.sale_price)}</div>
        <div><span className="text-slate-500 block text-xs uppercase tracking-wider">Purchase Price</span> {inr(item.purchase_price)}</div>
        <div><span className="text-slate-500 block text-xs uppercase tracking-wider">GST / HSN</span> {item.gst_rate}% · {item.hsn || "—"}</div>
        {byLocation.length > 0 && (
          <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200 mt-1">
            <span className="text-slate-500 text-xs uppercase tracking-wider block mb-1">By Location</span>
            <div className="flex gap-1.5 flex-wrap">
              {byLocation.map(([loc, q]) => (
                <Badge key={loc} variant="outline" className="rounded-sm font-normal">{loc}: {q} {item.uom}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Boxes className="h-3.5 w-3.5" /> Used in BOM(s)
        </div>
        {usedInBoms.length === 0 ? (
          <div className="text-sm text-slate-400 italic">Not linked to any BOM.</div>
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            {usedInBoms.map((b) => (
              <Badge key={b.id} variant="outline" className={`rounded-sm font-normal ${b.is_active === false ? "opacity-50" : ""}`}>
                {b.code || b.product_name} {b.revision ? `· Rev ${b.revision}` : ""}
              </Badge>
            ))}
          </div>
        )}
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
        <Empty label="No stock movements yet." />
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
                    Quantity
                    <ColumnFilterPopover
                      active={filters.quantity.value !== ""}
                      renderContent={(close) => (
                        <CategoryFilterContent
                          categoryOptions={NUM_CATEGORIES}
                          inputType="number"
                          valueLabel="Quantity"
                          committed={filters.quantity}
                          onApply={(v) => setFilters((f) => ({ ...f, quantity: v }))}
                          onClear={() => setFilters((f) => ({ ...f, quantity: { category: "equal", value: "" } }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                  <ColResizeHandle onMouseDown={startResize("quantity")} />
                </Th>
                <Th className="relative text-right">
                  <div className="flex items-center justify-end gap-1">
                    Price / Unit
                    <ColumnFilterPopover
                      active={filters.price.value !== ""}
                      renderContent={(close) => (
                        <CategoryFilterContent
                          categoryOptions={NUM_CATEGORIES}
                          inputType="number"
                          valueLabel="Price / Unit"
                          committed={filters.price}
                          onApply={(v) => setFilters((f) => ({ ...f, price: v }))}
                          onClear={() => setFilters((f) => ({ ...f, price: { category: "equal", value: "" } }))}
                          close={close}
                        />
                      )}
                    />
                  </div>
                  <ColResizeHandle onMouseDown={startResize("price")} />
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
                <tr><td colSpan={6}><Empty label="No transactions match the current filters." /></td></tr>
              ) : (
                txns.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td className="truncate">{t.type}</Td>
                    <Td className="font-mono-tech text-xs truncate">{t.number || "—"}</Td>
                    <Td className="truncate">{fmtDate(t.date)}</Td>
                    <Td className="text-right">{t.quantity}</Td>
                    <Td className="text-right">{inr(t.price_per_unit)}</Td>
                    <Td className="text-slate-500 truncate">{t.status || "—"}</Td>
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
