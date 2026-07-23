import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import {
  TEXT_CATEGORIES, DATE_CATEGORIES, NUM_CATEGORIES,
  matchesText, matchesDate, matchesNum,
  ColumnFilterPopover, CheckboxFilterContent, CategoryFilterContent,
} from "@/components/erp/TableFilters";
import { Plus, Search, Eye, FileDown, Mail, MessageCircle, Trash2, Download as DLIcon, Printer, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

const EMPTY_FILTERS = {
  code: { category: "contains", value: "" },
  party: { category: "contains", value: "" },
  date: { category: "equal", value: "" },
  amount: { category: "equal", value: "" },
  balance: { category: "equal", value: "" },
  dueDate: { category: "equal", value: "" },
  statuses: [],
};

/** Classify a bill for the Paid/Unpaid/Overdue buckets. The stored `status` field only ever gets
 * auto-set to "paid" or "unpaid" by the backend (see _refresh_bill_paid_status) — "overdue" is a
 * derived view, not a stored state, so it's computed here the same way /reports/overdue does it. */
function classify(bill, settledAmt) {
  const total = Number(bill.total) || 0;
  if (settledAmt >= total - 0.01) return "paid";
  const due = (bill.due_date || "").slice(0, 10);
  if (due && due < new Date().toISOString().slice(0, 10)) return "overdue";
  return "unpaid";
}
const STATUS_STYLE = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
};

/** Dedicated Purchase Bills page (separate from the generic DocList.jsx used by other simple doc
 * types like Credit Notes / Sale Orders) — its own summary shape (Paid/Unpaid/Overdue/Total,
 * matching how purchase-side bookkeeping is actually tracked) rather than sharing the Sales page's
 * Total/Received/Balance card. */
export default function PurchaseBills() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [settled, setSettled] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p, s] = await Promise.all([
        api.get("/vendor-bills"), api.get("/suppliers"),
        api.get("/vendor-bills/settled-summary").catch(() => ({ data: {} })),
      ]);
      setItems(r.data); setParties(p.data); setSettled(s.data || {});
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const baseFiltered = useMemo(() => items.filter((b) => {
    const d = (b.date || "").slice(0, 10);
    if (dateFrom && d && d < dateFrom) return false;
    if (dateTo && d && d > dateTo) return false;
    return true;
  }), [items, dateFrom, dateTo]);

  const buckets = useMemo(() => {
    let paid = 0, unpaid = 0, overdue = 0;
    for (const b of baseFiltered) {
      const s = settled[b.id] || 0;
      const cls = classify(b, s);
      const bal = (Number(b.total) || 0) - s;
      if (cls === "paid") paid += Number(b.total) || 0;
      else if (cls === "overdue") overdue += bal;
      else unpaid += bal;
    }
    return { paid, unpaid, overdue, total: paid + unpaid + overdue };
  }, [baseFiltered, settled]);

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => baseFiltered.filter((b) => {
    if (q && !((b.code || "").toLowerCase().includes(q) || (b.supplier_name || "").toLowerCase().includes(q))) return false;
    const cls = classify(b, settled[b.id] || 0);
    if (filters.statuses.length && !filters.statuses.includes(cls)) return false;
    if (!matchesText(b.code, filters.code)) return false;
    if (!matchesText(b.supplier_name, filters.party)) return false;
    if (!matchesDate(b.date, filters.date)) return false;
    if (!matchesDate(b.due_date, filters.dueDate)) return false;
    if (!matchesNum(b.total, filters.amount)) return false;
    const bal = (Number(b.total) || 0) - (settled[b.id] || 0);
    if (!matchesNum(bal, filters.balance)) return false;
    return true;
  }), [baseFiltered, q, filters, settled]);

  const hasActiveFilters = filters.statuses.length > 0 || !!filters.code.value || !!filters.party.value
    || !!filters.date.value || !!filters.dueDate.value || filters.amount.value !== "" || filters.balance.value !== "";

  const partyOf = (row) => parties.find((p) => p.id === row.supplier_id);

  const del = async (row) => {
    if (!window.confirm("Delete?")) return;
    try { await api.delete(`/vendor-bills/${row.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const downloadPdf = async (row) => {
    try {
      const r = await api.get(`/vendor-bills/${row.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = `${row.code}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("PDF failed"); }
  };
  const previewPdf = async (row) => {
    try {
      const r = await api.get(`/vendor-bills/${row.id}/pdf`, { responseType: "blob" });
      setPreviewUrl(window.URL.createObjectURL(r.data)); setPreviewRow(row); setPreviewOpen(true);
    } catch { toast.error("Preview failed"); }
  };
  const closePreview = () => { if (previewUrl) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(""); setPreviewOpen(false); };
  const sendWhatsApp = (row) => {
    const p = partyOf(row);
    if (!p?.phone) { toast.error("No phone number on file for this party"); return; }
    const msg = encodeURIComponent(`Hi ${p.name},\n\nRe: Purchase Bill ${row.code}.\nTotal: ₹${row.total}\n\n— Denplex Engineering Company`);
    window.open(`https://wa.me/${String(p.phone).replace(/\D/g, "")}?text=${msg}`, "_blank");
  };
  const emailDoc = async (row) => {
    const p = partyOf(row);
    if (!p?.email) { toast.error("Supplier email missing"); return; }
    try {
      const r = await api.get(`/vendor-bills/${row.id}/pdf`, { responseType: "blob" });
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = String(reader.result).split(",")[1];
        try {
          const res = await api.post("/email/send", {
            to: [p.email], subject: `Purchase Bill ${row.code}`,
            html: `<p>Hi ${p.name},</p><p>Re: Purchase Bill <strong>${row.code}</strong>. Total: ₹${row.total}.</p><p>— Denplex Engineering Company</p>`,
            attachment_base64: b64, attachment_filename: `${row.code}.pdf`,
          });
          toast.success(`Sent to ${p.email} from ${res.data?.from || "your mailbox"}`);
        } catch (e) { toast.error(e?.response?.data?.detail || "Email failed. Open Settings → Email Accounts."); }
      };
      reader.readAsDataURL(r.data);
    } catch { toast.error("PDF failed"); }
  };

  const exportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const r = await api.get(`/export/vendor-bills.xlsx?${params.toString()}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = "purchase-bills.xlsx"; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  return (
    <div data-testid="purchase-bills-page">
      <PageHeader
        overline="Purchases"
        title="Purchase Bills"
        subtitle="Track what you owe suppliers — paid, unpaid, and overdue at a glance."
        actions={
          <Button onClick={() => navigate("/app/purchase-bills/new")} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="purchase-bills-new">
            <Plus className="h-4 w-4 mr-1" /> Add Purchase
          </Button>
        }
      />

      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Filter by:</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-sm h-8 w-36 text-xs" />
          <span className="text-slate-400 text-xs">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-sm h-8 w-36 text-xs" />
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-sm p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Paid</div>
          <div className="font-display text-xl font-bold text-emerald-700 mt-1">{inr(buckets.paid)}</div>
        </div>
        <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 rounded-sm p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Unpaid</div>
          <div className="font-display text-xl font-bold text-amber-700 mt-1">{inr(buckets.unpaid)}</div>
        </div>
        <div className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-sm p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Overdue</div>
          <div className="font-display text-xl font-bold text-red-700 mt-1">{inr(buckets.overdue)}</div>
        </div>
        <div className="bg-white border border-slate-200 border-l-4 border-l-slate-400 rounded-sm p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Total</div>
          <div className="font-display text-xl font-bold text-slate-900 mt-1">{inr(buckets.total)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <Input placeholder="Search transactions…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-sm border-slate-300 pl-8 h-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-red-600 hover:underline">Clear column filters</button>
          )}
          <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={exportExcel}><FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel</Button>
          <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" /> Print</Button>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <Empty label="No transactions found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <Th><div className="flex items-center gap-1">Date
                  <ColumnFilterPopover active={!!filters.date.value} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={DATE_CATEGORIES} inputType="date" valueLabel="Select Date" committed={filters.date}
                      onApply={(v) => setFilters((f) => ({ ...f, date: v }))} onClear={() => setFilters((f) => ({ ...f, date: { category: "equal", value: "" } }))} close={close} />
                  )} />
                </div></Th>
                <Th><div className="flex items-center gap-1">Bill No
                  <ColumnFilterPopover active={!!filters.code.value} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={TEXT_CATEGORIES} inputType="text" valueLabel="Bill No" committed={filters.code}
                      onApply={(v) => setFilters((f) => ({ ...f, code: v }))} onClear={() => setFilters((f) => ({ ...f, code: { category: "contains", value: "" } }))} close={close} />
                  )} />
                </div></Th>
                <Th><div className="flex items-center gap-1">Party Name
                  <ColumnFilterPopover active={!!filters.party.value} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={TEXT_CATEGORIES} inputType="text" valueLabel="Party Name" committed={filters.party}
                      onApply={(v) => setFilters((f) => ({ ...f, party: v }))} onClear={() => setFilters((f) => ({ ...f, party: { category: "contains", value: "" } }))} close={close} />
                  )} />
                </div></Th>
                <Th className="text-right"><div className="flex items-center justify-end gap-1">Amount
                  <ColumnFilterPopover active={filters.amount.value !== ""} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={NUM_CATEGORIES} inputType="number" valueLabel="Amount" committed={filters.amount}
                      onApply={(v) => setFilters((f) => ({ ...f, amount: v }))} onClear={() => setFilters((f) => ({ ...f, amount: { category: "equal", value: "" } }))} close={close} />
                  )} />
                </div></Th>
                <Th className="text-right"><div className="flex items-center justify-end gap-1">Balance Due
                  <ColumnFilterPopover active={filters.balance.value !== ""} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={NUM_CATEGORIES} inputType="number" valueLabel="Balance Due" committed={filters.balance}
                      onApply={(v) => setFilters((f) => ({ ...f, balance: v }))} onClear={() => setFilters((f) => ({ ...f, balance: { category: "equal", value: "" } }))} close={close} />
                  )} />
                </div></Th>
                <Th><div className="flex items-center gap-1">Due Date
                  <ColumnFilterPopover active={!!filters.dueDate.value} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={DATE_CATEGORIES} inputType="date" valueLabel="Select Date" committed={filters.dueDate}
                      onApply={(v) => setFilters((f) => ({ ...f, dueDate: v }))} onClear={() => setFilters((f) => ({ ...f, dueDate: { category: "equal", value: "" } }))} close={close} />
                  )} />
                </div></Th>
                <Th><div className="flex items-center gap-1">Status
                  <ColumnFilterPopover active={filters.statuses.length > 0} renderContent={(close) => (
                    <CheckboxFilterContent options={["paid", "unpaid", "overdue"]} committed={filters.statuses}
                      onApply={(v) => setFilters((f) => ({ ...f, statuses: v }))} onClear={() => setFilters((f) => ({ ...f, statuses: [] }))} close={close} />
                  )} />
                </div></Th>
                <Th className="text-right">Actions</Th>
              </tr></thead>
              <tbody>
                {rows.map((row) => {
                  const s = settled[row.id] || 0;
                  const bal = (Number(row.total) || 0) - s;
                  const cls = classify(row, s);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <Td>{fmtDate(row.date)}</Td>
                      <Td className="font-mono-tech text-xs">{row.code}</Td>
                      <Td>{row.supplier_name}</Td>
                      <Td className="text-right font-mono-tech">{inr(row.total)}</Td>
                      <Td className="text-right font-mono-tech">{bal > 0.5 ? inr(bal) : "—"}</Td>
                      <Td>{fmtDate(row.due_date)}</Td>
                      <Td><span className={`inline-block px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-semibold border ${STATUS_STYLE[cls]}`}>{cls}</span></Td>
                      <Td className="text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => previewPdf(row)} title="Preview PDF"><Eye className="h-4 w-4 text-slate-700" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadPdf(row)} title="Download PDF"><FileDown className="h-4 w-4 text-slate-700" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => emailDoc(row)} title="Email"><Mail className="h-4 w-4 text-red-600" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => sendWhatsApp(row)} title="WhatsApp web"><MessageCircle className="h-4 w-4 text-emerald-600" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(row)} title="Delete"><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={previewOpen} onOpenChange={(v) => { if (!v) closePreview(); }}>
        <DialogContent className="rounded-sm max-w-5xl p-0 overflow-hidden" data-testid="pdf-preview-dialog">
          <DialogHeader className="px-5 py-3 border-b border-slate-200">
            <DialogTitle className="font-display flex items-center justify-between">
              <span>{previewRow?.code} — PDF Preview</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-sm" onClick={() => previewRow && downloadPdf(previewRow)}><DLIcon className="h-4 w-4 mr-1" /> Download</Button>
                <Button size="sm" variant="outline" className="rounded-sm" onClick={() => previewRow && emailDoc(previewRow)}><Mail className="h-4 w-4 mr-1" /> Email</Button>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="bg-slate-100 h-[78vh]">
            {previewUrl ? <iframe title="pdf-preview" src={previewUrl} className="w-full h-full border-0" /> : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading...</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
