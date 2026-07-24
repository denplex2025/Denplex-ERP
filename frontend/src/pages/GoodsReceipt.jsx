import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { Plus, Trash2, Eye, PackageCheck, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";

const QUALITY_STYLE = {
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
};
const MATCH_STYLE = {
  matched: "bg-emerald-50 text-emerald-700 border-emerald-200",
  gr_not_billed: "bg-amber-50 text-amber-700 border-amber-200",
  billed_not_received: "bg-red-50 text-red-700 border-red-200",
};
const MATCH_LABEL = {
  matched: "Matched",
  gr_not_billed: "Received, not billed",
  billed_not_received: "Billed, not received",
};

/** Goods Receipt (GRN) + GRIR reconciliation. Two tabs:
 *  - Receipts: log a delivery against a Purchase Order (received qty/quality per line)
 *  - GRIR Reconciliation: PO vs cumulative Goods Receipts vs linked Vendor Bills (po_id), on a
 *    pre-tax basis — see backend /reports/grir for the matching logic. */
export default function GoodsReceipt() {
  const [tab, setTab] = useState("receipts");
  const [receipts, setReceipts] = useState([]);
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grir, setGrir] = useState(null);
  const [grirLoading, setGrirLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [poDetail, setPoDetail] = useState(null);
  const [poLoading, setPoLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([api.get("/goods-receipts"), api.get("/purchase-orders")]);
      setReceipts(r.data || []);
      setPos((p.data || []).filter((po) => po.status !== "cancelled"));
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const loadGrir = async () => {
    setGrirLoading(true);
    try { const r = await api.get("/reports/grir"); setGrir(r.data); }
    catch { toast.error("Failed to load GRIR report"); }
    finally { setGrirLoading(false); }
  };
  useEffect(() => { if (tab === "grir" && !grir) loadGrir(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setSelectedPoId(""); setPoDetail(null); setLines([]);
    setDate(new Date().toISOString().slice(0, 10)); setNotes("");
    setOpen(true);
  };

  const pickPo = async (poId) => {
    setSelectedPoId(poId);
    setPoDetail(null); setLines([]);
    if (!poId) return;
    setPoLoading(true);
    try {
      const r = await api.get(`/purchase-orders/${poId}/receipts`);
      setPoDetail(r.data);
      setLines((r.data.lines || []).map((l) => ({
        line_no: l.line_no, description: l.description, item_code: l.item_code, hsn: l.hsn,
        unit: l.unit, ordered_qty: l.ordered_qty, rate: l.rate,
        received_qty: l.remaining_qty, quality_status: "accepted", remarks: "",
      })));
    } catch { toast.error("Failed to load Purchase Order lines"); }
    finally { setPoLoading(false); }
  };

  const setLineField = (i, k, v) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const save = async () => {
    if (!selectedPoId) { toast.error("Select a Purchase Order"); return; }
    if (!lines.some((l) => Number(l.received_qty) > 0)) { toast.error("Enter received quantity for at least one line"); return; }
    setSaving(true);
    try {
      await api.post("/goods-receipts", {
        po_id: selectedPoId, date, notes,
        lines: lines.map((l) => ({ ...l, received_qty: Number(l.received_qty || 0) })),
      });
      toast.success("Goods Receipt saved");
      setOpen(false);
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const del = async (row) => {
    if (!window.confirm(`Delete Goods Receipt ${row.code}?`)) return;
    try { await api.delete(`/goods-receipts/${row.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  const poOptions = useMemo(() => [...pos].sort((a, b) => (b.date || "").localeCompare(a.date || "")), [pos]);

  return (
    <div data-testid="goods-receipt-page">
      <PageHeader
        overline="Procurement"
        title="Goods Receipt"
        subtitle="Log deliveries against Purchase Orders, then reconcile Receipt vs Bill (GRIR)."
        actions={
          tab === "receipts" && (
            <Button onClick={openCreate} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="grn-new">
              <Plus className="h-4 w-4 mr-1" /> New Goods Receipt
            </Button>
          )
        }
      />

      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        <button
          onClick={() => setTab("receipts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "receipts" ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <PackageCheck className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" /> Receipts
        </button>
        <button
          onClick={() => setTab("grir")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "grir" ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" /> GRIR Reconciliation
        </button>
      </div>

      {tab === "receipts" ? (
        <Card>
          {loading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
          ) : receipts.length === 0 ? (
            <Empty label="No goods receipts logged yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <Th>GRN No</Th>
                  <Th>PO No</Th>
                  <Th>Supplier</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Lines</Th>
                  <Th className="text-right">Actions</Th>
                </tr></thead>
                <tbody>
                  {receipts.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <Td className="font-mono-tech text-xs">{row.code}</Td>
                      <Td className="font-mono-tech text-xs">{row.po_code}</Td>
                      <Td>{row.supplier_name}</Td>
                      <Td>{fmtDate(row.date)}</Td>
                      <Td className="text-right">{(row.lines || []).length}</Td>
                      <Td className="text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setViewRow(row); setViewOpen(true); }} title="View"><Eye className="h-4 w-4 text-slate-700" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(row)} title="Delete"><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <>
          {grirLoading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
          ) : !grir ? (
            <Empty label="No data." />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-sm p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Received Value</div>
                  <div className="font-display text-xl font-bold text-slate-900 mt-1">{inr(grir.totals.received_value)}</div>
                </div>
                <div className="bg-white border border-slate-200 border-l-4 border-l-slate-400 rounded-sm p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Billed Value</div>
                  <div className="font-display text-xl font-bold text-slate-900 mt-1">{inr(grir.totals.billed_value)}</div>
                </div>
                <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 rounded-sm p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Net Clearing (GR − IR)</div>
                  <div className={`font-display text-xl font-bold mt-1 ${grir.totals.clearing >= 0 ? "text-amber-700" : "text-red-700"}`}>{inr(Math.abs(grir.totals.clearing))}</div>
                </div>
              </div>
              <Card>
                {grir.rows.length === 0 ? (
                  <Empty label="No Purchase Orders with a linked Goods Receipt or Bill yet. Link a Vendor Bill to a PO when creating it to start reconciling." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr>
                        <Th>PO No</Th>
                        <Th>Supplier</Th>
                        <Th>PO Date</Th>
                        <Th className="text-right">Ordered</Th>
                        <Th className="text-right">Received</Th>
                        <Th className="text-right">Billed</Th>
                        <Th className="text-right">Clearing</Th>
                        <Th>Status</Th>
                      </tr></thead>
                      <tbody>
                        {grir.rows.map((row) => (
                          <tr key={row.po_id} className="hover:bg-slate-50">
                            <Td className="font-mono-tech text-xs">{row.po_code}</Td>
                            <Td>{row.supplier_name}</Td>
                            <Td>{fmtDate(row.po_date)}</Td>
                            <Td className="text-right font-mono-tech">{inr(row.ordered_value)}</Td>
                            <Td className="text-right font-mono-tech">{inr(row.received_value)}</Td>
                            <Td className="text-right font-mono-tech">{inr(row.billed_value)}</Td>
                            <Td className="text-right font-mono-tech">{inr(Math.abs(row.clearing))}</Td>
                            <Td><span className={`inline-block px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-semibold border ${MATCH_STYLE[row.status]}`}>{MATCH_LABEL[row.status]}</span></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}

      {/* New Goods Receipt dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-3xl" data-testid="grn-dialog">
          <DialogHeader><DialogTitle className="font-display tracking-tight">New Goods Receipt</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Purchase Order *</Label>
              <select
                value={selectedPoId}
                onChange={(e) => pickPo(e.target.value)}
                className="mt-1.5 w-full h-9 text-sm border border-slate-300 rounded-sm px-2 bg-white"
              >
                <option value="">Select a Purchase Order…</option>
                {poOptions.map((po) => (
                  <option key={po.id} value={po.id}>{po.code} — {po.supplier_name} ({fmtDate(po.date)})</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-600">Receipt Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 rounded-sm" />
            </div>
          </div>

          {poLoading ? (
            <div className="text-sm text-slate-500 py-6 text-center">Loading PO lines…</div>
          ) : lines.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-sm mt-2">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="p-2">Item / Description</th>
                  <th className="p-2 text-right">Ordered</th>
                  <th className="p-2 text-right">Remaining</th>
                  <th className="p-2 text-right w-28">Received Qty</th>
                  <th className="p-2 w-32">Quality</th>
                  <th className="p-2 min-w-[140px]">Remarks</th>
                </tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-2">{l.description}</td>
                      <td className="p-2 text-right font-mono-tech">{l.ordered_qty}</td>
                      <td className="p-2 text-right font-mono-tech text-slate-500">{poDetail?.lines?.[i]?.remaining_qty ?? "—"}</td>
                      <td className="p-2"><Input type="number" value={l.received_qty} onChange={(e) => setLineField(i, "received_qty", e.target.value)} className="h-8 w-24 text-right" /></td>
                      <td className="p-2">
                        <select value={l.quality_status} onChange={(e) => setLineField(i, "quality_status", e.target.value)} className="h-8 text-xs border border-slate-200 rounded-sm px-1 bg-white w-full">
                          <option value="accepted">Accepted</option>
                          <option value="partial">Partial</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>
                      <td className="p-2"><Input value={l.remarks} onChange={(e) => setLineField(i, "remarks", e.target.value)} className="h-8" placeholder="Optional" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : selectedPoId ? (
            <Empty label="This PO has no remaining quantity to receive." />
          ) : null}

          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-600">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5" placeholder="e.g. delivery vehicle no., driver, condition of packaging…" />
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !selectedPoId} className="rounded-sm bg-red-600 hover:bg-red-700">{saving ? "Saving…" : "Save Goods Receipt"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View GRN dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="rounded-sm max-w-2xl" data-testid="grn-view-dialog">
          <DialogHeader><DialogTitle className="font-display tracking-tight">{viewRow?.code} — {viewRow?.po_code}</DialogTitle></DialogHeader>
          {viewRow && (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                <span className="text-slate-500">Supplier:</span> {viewRow.supplier_name} &nbsp;·&nbsp;
                <span className="text-slate-500">Date:</span> {fmtDate(viewRow.date)}
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-sm">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="p-2">Item</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2">Quality</th><th className="p-2">Remarks</th>
                  </tr></thead>
                  <tbody>
                    {(viewRow.lines || []).map((l, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2">{l.description}</td>
                        <td className="p-2 text-right font-mono-tech">{l.ordered_qty}</td>
                        <td className="p-2 text-right font-mono-tech">{l.received_qty}</td>
                        <td className="p-2"><span className={`inline-block px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-semibold border ${QUALITY_STYLE[l.quality_status]}`}>{l.quality_status}</span></td>
                        <td className="p-2 text-slate-500">{l.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {viewRow.notes && <div className="text-sm"><span className="text-slate-500">Notes:</span> {viewRow.notes}</div>}
            </div>
          )}
          <DialogFooter><Button variant="outline" className="rounded-sm" onClick={() => setViewOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
