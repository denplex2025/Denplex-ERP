import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import {
  TEXT_CATEGORIES, DATE_CATEGORIES, NUM_CATEGORIES,
  matchesText, matchesDate, matchesNum,
  ColumnFilterPopover, CheckboxFilterContent, CategoryFilterContent,
} from "@/components/erp/TableFilters";
import { useColumnWidths, ColResizeHandle } from "@/components/erp/ColumnResize";
import { Plus, Search, Eye, FileDown, Mail, MessageCircle, Edit, Trash2, Download as DLIcon, Printer, FileSpreadsheet, MapPin } from "lucide-react";
import { toast } from "sonner";

const GODOWNS = ["All", "Vatva", "Santej"];
const DEFAULT_COL_WIDTHS = { date: 110, code: 110, party: 220, amount: 120, balance: 120, dueDate: 110, status: 100 };
const EMPTY_FILTERS = {
  code: { category: "contains", value: "" },
  party: { category: "contains", value: "" },
  date: { category: "equal", value: "" },
  amount: { category: "equal", value: "" },
  balance: { category: "equal", value: "" },
  dueDate: { category: "equal", value: "" },
  statuses: [],
};

/** Sales Invoices report: date-range + godown filter bar, a Total/Received/Balance summary card,
 * and a flat (non-dual-pane) transactions table with Vyapar-style per-column funnel filters. */
export default function Invoices() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [settled, setSettled] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [godown, setGodown] = useState("All");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);
  const [colWidths, startResize] = useColumnWidths("colw:sales-invoices", DEFAULT_COL_WIDTHS);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p, s] = await Promise.all([
        api.get("/invoices"), api.get("/customers"),
        api.get("/invoices/settled-summary").catch(() => ({ data: {} })),
      ]);
      setItems(r.data); setParties(p.data); setSettled(s.data || {});
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const baseFiltered = useMemo(() => items.filter((inv) => {
    const d = (inv.date || "").slice(0, 10);
    if (dateFrom && d && d < dateFrom) return false;
    if (dateTo && d && d > dateTo) return false;
    if (godown !== "All" && (inv.godown || "") !== godown) return false;
    return true;
  }), [items, dateFrom, dateTo, godown]);

  const totalSales = baseFiltered.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const received = baseFiltered.reduce((s, i) => s + Math.min(settled[i.id] || 0, Number(i.total) || 0), 0);
  const balanceDue = totalSales - received;

  const statusOptions = useMemo(() => [...new Set(baseFiltered.map((i) => i.status))], [baseFiltered]);
  const q = search.trim().toLowerCase();

  const rows = useMemo(() => baseFiltered.filter((inv) => {
    if (q && !((inv.code || "").toLowerCase().includes(q) || (inv.customer_name || "").toLowerCase().includes(q))) return false;
    if (filters.statuses.length && !filters.statuses.includes(inv.status)) return false;
    if (!matchesText(inv.code, filters.code)) return false;
    if (!matchesText(inv.customer_name, filters.party)) return false;
    if (!matchesDate(inv.date, filters.date)) return false;
    if (!matchesDate(inv.due_date, filters.dueDate)) return false;
    if (!matchesNum(inv.total, filters.amount)) return false;
    const bal = (Number(inv.total) || 0) - (settled[inv.id] || 0);
    if (!matchesNum(bal, filters.balance)) return false;
    return true;
  }), [baseFiltered, q, filters, settled]);

  const hasActiveFilters = filters.statuses.length > 0 || !!filters.code.value || !!filters.party.value
    || !!filters.date.value || !!filters.dueDate.value || filters.amount.value !== "" || filters.balance.value !== "";

  const partyOf = (row) => parties.find((p) => p.id === row.customer_id);

  const del = async (row) => {
    if (!window.confirm("Delete?")) return;
    try { await api.delete(`/invoices/${row.id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Failed"); }
  };
  const downloadPdf = async (row) => {
    try {
      const r = await api.get(`/invoices/${row.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = `${row.code}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("PDF failed"); }
  };
  const previewPdf = async (row) => {
    try {
      const r = await api.get(`/invoices/${row.id}/pdf`, { responseType: "blob" });
      setPreviewUrl(window.URL.createObjectURL(r.data)); setPreviewRow(row); setPreviewOpen(true);
    } catch { toast.error("Preview failed"); }
  };
  const closePreview = () => { if (previewUrl) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(""); setPreviewOpen(false); };
  const sendWhatsApp = (row) => {
    const p = partyOf(row);
    if (!p?.phone) { toast.error("No phone number on file for this party"); return; }
    const msg = encodeURIComponent(`Hi ${p.name},\n\nPlease find Sale Invoice ${row.code} attached.\nTotal: ₹${row.total}\n\n— Denplex Engineering Company`);
    window.open(`https://wa.me/${String(p.phone).replace(/\D/g, "")}?text=${msg}`, "_blank");
  };
  const sendTwilioWA = async (row) => {
    const p = partyOf(row);
    if (!p?.phone) { toast.error("No phone on file"); return; }
    const body = `Hi ${p.name}, your Sale Invoice ${row.code} is ready. Total ₹${row.total}.`;
    try { await api.post("/whatsapp/send", { to_phone: p.phone, body }); toast.success("WhatsApp queued via Twilio"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const emailDoc = async (row) => {
    const p = partyOf(row);
    if (!p?.email) { toast.error("Customer email missing"); return; }
    try {
      const r = await api.get(`/invoices/${row.id}/pdf`, { responseType: "blob" });
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = String(reader.result).split(",")[1];
        try {
          const res = await api.post("/email/send", {
            to: [p.email], subject: `Sale Invoice ${row.code}`,
            html: `<p>Hi ${p.name},</p><p>Please find Sale Invoice <strong>${row.code}</strong> attached. Total: ₹${row.total}.</p><p>— Denplex Engineering Company</p>`,
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
      const r = await api.get(`/export/invoices.xlsx?${params.toString()}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = "invoices.xlsx"; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  return (
    <div data-testid="invoices-page">
      <PageHeader
        overline="Accounting"
        title="Sale Invoices"
        subtitle="CGST/SGST for intra-state, IGST for inter-state — auto computed."
        actions={
          <Button onClick={() => navigate("/app/invoices/new")} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="invoices-page-new">
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        }
      />

      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Filter by:</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-sm h-8 w-36 text-xs" />
          <span className="text-slate-400 text-xs">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-sm h-8 w-36 text-xs" />
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold ml-2 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> Godown</span>
          {GODOWNS.map((g) => (
            <button key={g} onClick={() => setGodown(g)} className={`px-2.5 py-1 text-xs rounded-sm font-medium border ${godown === g ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{g}</button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-slate-200 rounded-sm p-4 sm:col-span-1">
          <div className="text-xs uppercase tracking-wider text-slate-500">Total Sales Amount</div>
          <div className="font-display text-2xl font-bold text-slate-900 mt-1">{inr(totalSales)}</div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <div>Received: <span className="text-emerald-600 font-semibold">{inr(received)}</span></div>
            <div>Balance: <span className={`font-semibold ${balanceDue > 0.5 ? "text-red-600" : "text-slate-700"}`}>{inr(balanceDue)}</span></div>
          </div>
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
            <table style={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                {Object.entries(colWidths).map(([k, w]) => <col key={k} style={{ width: w }} />)}
                <col style={{ width: 260 }} />
              </colgroup>
              <thead><tr>
                <Th className="relative"><div className="flex items-center gap-1">Date
                  <ColumnFilterPopover active={!!filters.date.value} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={DATE_CATEGORIES} inputType="date" valueLabel="Select Date" committed={filters.date}
                      onApply={(v) => setFilters((f) => ({ ...f, date: v }))} onClear={() => setFilters((f) => ({ ...f, date: { category: "equal", value: "" } }))} close={close} />
                  )} />
                </div><ColResizeHandle onMouseDown={startResize("date")} /></Th>
                <Th className="relative"><div className="flex items-center gap-1">Invoice No
                  <ColumnFilterPopover active={!!filters.code.value} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={TEXT_CATEGORIES} inputType="text" valueLabel="Invoice No" committed={filters.code}
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
                <Th className="relative text-right"><div className="flex items-center justify-end gap-1">Balance
                  <ColumnFilterPopover active={filters.balance.value !== ""} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={NUM_CATEGORIES} inputType="number" valueLabel="Balance" committed={filters.balance}
                      onApply={(v) => setFilters((f) => ({ ...f, balance: v }))} onClear={() => setFilters((f) => ({ ...f, balance: { category: "equal", value: "" } }))} close={close} />
                  )} />
                </div><ColResizeHandle onMouseDown={startResize("balance")} /></Th>
                <Th className="relative"><div className="flex items-center gap-1">Due Date
                  <ColumnFilterPopover active={!!filters.dueDate.value} renderContent={(close) => (
                    <CategoryFilterContent categoryOptions={DATE_CATEGORIES} inputType="date" valueLabel="Select Date" committed={filters.dueDate}
                      onApply={(v) => setFilters((f) => ({ ...f, dueDate: v }))} onClear={() => setFilters((f) => ({ ...f, dueDate: { category: "equal", value: "" } }))} close={close} />
                  )} />
                </div><ColResizeHandle onMouseDown={startResize("dueDate")} /></Th>
                <Th className="relative"><div className="flex items-center gap-1">Status
                  <ColumnFilterPopover active={filters.statuses.length > 0} renderContent={(close) => (
                    <CheckboxFilterContent options={statusOptions} committed={filters.statuses}
                      onApply={(v) => setFilters((f) => ({ ...f, statuses: v }))} onClear={() => setFilters((f) => ({ ...f, statuses: [] }))} close={close} />
                  )} />
                </div><ColResizeHandle onMouseDown={startResize("status")} /></Th>
                <Th className="text-right">Actions</Th>
              </tr></thead>
              <tbody>
                {rows.map((row) => {
                  const bal = (Number(row.total) || 0) - (settled[row.id] || 0);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <Td className="truncate">{fmtDate(row.date)}</Td>
                      <Td className="font-mono-tech text-xs truncate">{row.code}</Td>
                      <Td className="truncate">{row.customer_name}</Td>
                      <Td className="text-right font-mono-tech">{inr(row.total)}</Td>
                      <Td className="text-right font-mono-tech">{bal > 0.5 ? inr(bal) : "—"}</Td>
                      <Td className="truncate">{fmtDate(row.due_date)}</Td>
                      <Td><StatusBadge status={row.status} /></Td>
                      <Td className="text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => previewPdf(row)} title="Preview PDF"><Eye className="h-4 w-4 text-slate-700" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadPdf(row)} title="Download PDF"><FileDown className="h-4 w-4 text-slate-700" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => emailDoc(row)} title="Email"><Mail className="h-4 w-4 text-red-600" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => sendWhatsApp(row)} title="WhatsApp web"><MessageCircle className="h-4 w-4 text-emerald-600" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => sendTwilioWA(row)} title="WhatsApp via Twilio"><MessageCircle className="h-4 w-4 text-emerald-800" strokeWidth={2.5} /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(`/app/invoices/${row.id}/edit`)} title="Edit"><Edit className="h-4 w-4" /></Button>
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
