import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import { Plus, Search, Eye, FileDown, Mail, MessageCircle, Edit, Trash2, Download as DLIcon } from "lucide-react";
import { toast } from "sonner";

const STATUS_CHIPS = ["All", "draft", "sent", "paid", "overdue"];

/** Master-detail (left list / right document detail) layout for Sale Invoices, matching the
 * Customers/Suppliers/Items dual-pane pattern. Deliberately its own component rather than a change
 * to the shared LineItemDoc.jsx — LineItemDoc is still used unmodified by Quotations, Purchase
 * Orders, Sale Orders, Vendor Bills etc, so this only affects the Invoices page. */
export function InvoiceDualPane({ testid, overline, title, subtitle, endpoint, partyEndpoint, partyField, partyNameField, partyKey, createTo, editTo }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([api.get(endpoint), api.get(partyEndpoint)]);
      setItems(r.data); setParties(p.data);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([
      api.get(`${endpoint}/${selectedId}`),
      api.get(`${endpoint}/${selectedId}/payments`).catch(() => ({ data: null })),
    ]).then(([invR, payR]) => {
      if (cancelled) return;
      setDetail({ invoice: invR.data, payments: payR.data });
    }).catch(() => { if (!cancelled) toast.error("Failed to load invoice"); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, endpoint]);

  const q = search.trim().toLowerCase();
  const filtered = items.filter((r) => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (!q) return true;
    return (r.code || "").toLowerCase().includes(q) || (r[partyNameField] || "").toLowerCase().includes(q);
  });

  const del = async (row) => {
    if (!window.confirm("Delete?")) return;
    try {
      await api.delete(`${endpoint}/${row.id}`);
      toast.success("Deleted");
      if (selectedId === row.id) setSelectedId(null);
      load();
    } catch { toast.error("Failed"); }
  };

  const downloadPdf = async (row) => {
    try {
      const r = await api.get(`${endpoint}/${row.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = `${row.code}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("PDF failed"); }
  };
  const previewPdf = async (row) => {
    try {
      const r = await api.get(`${endpoint}/${row.id}/pdf`, { responseType: "blob" });
      setPreviewUrl(window.URL.createObjectURL(r.data));
      setPreviewOpen(true);
    } catch { toast.error("Preview failed"); }
  };
  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(""); setPreviewOpen(false);
  };

  const partyOf = (row) => parties.find((p) => p.id === row?.[`${partyKey}_id`]);
  const sendWhatsApp = (row) => {
    const p = partyOf(row);
    if (!p?.phone) { toast.error("No phone number on file for this party"); return; }
    const msg = encodeURIComponent(`Hi ${p.name},\n\nPlease find ${title.replace(/s$/, "")} ${row.code} attached.\nTotal: ₹${row.total}\n\n— Denplex Engineering Company`);
    window.open(`https://wa.me/${String(p.phone).replace(/\D/g, "")}?text=${msg}`, "_blank");
  };
  const sendTwilioWA = async (row) => {
    const p = partyOf(row);
    if (!p?.phone) { toast.error("No phone on file"); return; }
    const body = `Hi ${p.name}, your ${title.replace(/s$/, "")} ${row.code} is ready. Total ₹${row.total}.`;
    try { await api.post("/whatsapp/send", { to_phone: p.phone, body }); toast.success("WhatsApp queued via Twilio"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const emailDoc = async (row) => {
    const p = partyOf(row);
    if (!p?.email) { toast.error("Customer email missing"); return; }
    try {
      const r = await api.get(`${endpoint}/${row.id}/pdf`, { responseType: "blob" });
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = String(reader.result).split(",")[1];
        try {
          const res = await api.post("/email/send", {
            to: [p.email], subject: `${title.replace(/s$/, "")} ${row.code}`,
            html: `<p>Hi ${p.name},</p><p>Please find ${title.replace(/s$/, "")} <strong>${row.code}</strong> attached. Total: ₹${row.total}.</p><p>— Denplex Engineering Company</p>`,
            attachment_base64: b64, attachment_filename: `${row.code}.pdf`,
          });
          toast.success(`Sent to ${p.email} from ${res.data?.from || "your mailbox"}`);
        } catch (e) { toast.error(e?.response?.data?.detail || "Email failed. Open Settings → Email Accounts."); }
      };
      reader.readAsDataURL(r.data);
    } catch { toast.error("PDF failed"); }
  };

  const selectedRow = items.find((r) => r.id === selectedId);
  const inv = detail?.invoice;
  const pay = detail?.payments;

  return (
    <div data-testid={testid}>
      <PageHeader
        overline={overline}
        title={title}
        subtitle={subtitle}
        actions={
          <Button onClick={() => navigate(createTo)} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid={`${testid}-new`}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-slate-200 space-y-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <Input
                placeholder="Search code or customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-sm border-slate-300 pl-8 h-8 text-sm"
                data-testid={`${testid}-search`}
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {STATUS_CHIPS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2 py-0.5 text-xs rounded-sm font-medium border capitalize ${statusFilter === s ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
            ) : filtered.length === 0 ? (
              <Empty label="No records found." />
            ) : (
              filtered.map((row) => (
                <div
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`px-3 py-2.5 border-b border-slate-100 cursor-pointer ${selectedId === row.id ? "bg-red-50 border-l-2 border-l-red-600" : "hover:bg-slate-50"}`}
                  data-testid={`doc-row-${row.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate font-mono-tech">{row.code}</div>
                      <div className="text-xs text-slate-500 truncate">{row[partyNameField]}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono-tech text-slate-700">{inr(row.total)}</div>
                      <div className="text-[11px] text-slate-400">{fmtDate(row.date)}</div>
                    </div>
                  </div>
                  <div className="mt-1"><StatusBadge status={row.status} /></div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5 min-h-[400px]">
          {!selectedId ? (
            <Empty label="Select a record on the left to view its details." />
          ) : detailLoading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
          ) : !inv ? (
            <Empty label="Could not load this record." />
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-display text-xl font-bold text-slate-900 font-mono-tech">{inv.code}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{inv[partyNameField]}</div>
                  <div className="mt-1"><StatusBadge status={inv.status} /></div>
                </div>
                <div className="flex gap-1 shrink-0 flex-wrap">
                  <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => previewPdf(selectedRow)} title="Preview PDF" data-testid="inv-preview"><Eye className="h-4 w-4 text-slate-700" /></Button>
                  <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => downloadPdf(selectedRow)} title="Download PDF" data-testid="inv-pdf"><FileDown className="h-4 w-4 text-slate-700" /></Button>
                  <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => emailDoc(selectedRow)} title="Email"><Mail className="h-4 w-4 text-red-600" /></Button>
                  <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => sendWhatsApp(selectedRow)} title="WhatsApp web"><MessageCircle className="h-4 w-4 text-emerald-600" /></Button>
                  <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => sendTwilioWA(selectedRow)} title="WhatsApp via Twilio"><MessageCircle className="h-4 w-4 text-emerald-800" strokeWidth={2.5} /></Button>
                  {editTo && <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => navigate(editTo(selectedRow))} data-testid="inv-edit"><Edit className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => del(selectedRow)} data-testid="inv-delete"><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm bg-slate-50 border border-slate-200 rounded-sm p-4">
                <div><span className="text-slate-500">Date:</span> {fmtDate(inv.date)}</div>
                <div><span className="text-slate-500">Due Date:</span> {fmtDate(inv.due_date)}</div>
                <div><span className="text-slate-500">GSTIN:</span> {inv.customer_gstin || "—"}</div>
                <div><span className="text-slate-500">Place of Supply:</span> {inv.place_of_supply || "—"}</div>
                <div><span className="text-slate-500">GST Type:</span> {inv.is_interstate ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}</div>
                <div><span className="text-slate-500">Payment Mode:</span> {inv.payment_mode || "—"}</div>
                {inv.po_number && <div><span className="text-slate-500">PO Number:</span> {inv.po_number}</div>}
                {inv.eway_bill_no && <div><span className="text-slate-500">E-way Bill:</span> {inv.eway_bill_no}</div>}
                {inv.godown && <div><span className="text-slate-500">Godown:</span> {inv.godown}</div>}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Line Items</div>
                {(inv.lines || []).length === 0 ? (
                  <Empty label="No line items." />
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-sm">
                    <table className="w-full">
                      <thead><tr>
                        <Th>Description</Th><Th>HSN</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">GST%</Th><Th className="text-right">Amount</Th>
                      </tr></thead>
                      <tbody>
                        {inv.lines.map((l, i) => {
                          const gross = (Number(l.qty) || 0) * (Number(l.rate) || 0);
                          const disc = (Number(l.discount_amount) || 0) + gross * ((Number(l.discount_pct) || 0) / 100);
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <Td>{l.description}</Td>
                              <Td className="font-mono-tech text-xs">{l.hsn || "—"}</Td>
                              <Td className="text-right">{l.qty} {l.unit || ""}</Td>
                              <Td className="text-right">{inr(l.rate)}</Td>
                              <Td className="text-right">{l.gst_rate}%</Td>
                              <Td className="text-right">{inr(gross - disc)}</Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex justify-end gap-6 mt-2 text-sm">
                  <div className="text-slate-600">Subtotal: <span className="font-mono-tech text-slate-900">{inr(inv.subtotal)}</span></div>
                  {!!inv.round_off && <div className="text-slate-600">Round Off: <span className="font-mono-tech text-slate-900">{inr(inv.round_off)}</span></div>}
                  <div className="font-semibold">Total: <span className="font-mono-tech">{inr(inv.total)}</span></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payments Received</div>
                  {pay && (
                    <div className="text-xs">
                      <span className="text-slate-500">Balance Due:</span>{" "}
                      <span className={`font-display font-bold ${pay.balance > 0.01 ? "text-red-600" : "text-emerald-600"}`}>{inr(Math.max(pay.balance, 0))}</span>
                    </div>
                  )}
                </div>
                {!pay || pay.payments.length === 0 ? (
                  <Empty label="No payments recorded against this invoice yet." />
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-sm">
                    <table className="w-full">
                      <thead><tr><Th>Payment #</Th><Th>Date</Th><Th className="text-right">Amount</Th><Th>Type</Th></tr></thead>
                      <tbody>
                        {pay.payments.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <Td className="font-mono-tech text-xs">{p.payment_code || "—"}</Td>
                            <Td>{fmtDate(p.date)}</Td>
                            <Td className="text-right">{inr(p.amount)}</Td>
                            <Td>{p.payment_type || "—"}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {inv.notes && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Notes</div>
                  <div className="text-sm text-slate-600">{inv.notes}</div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={previewOpen} onOpenChange={(v) => { if (!v) closePreview(); }}>
        <DialogContent className="rounded-sm max-w-5xl p-0 overflow-hidden" data-testid="pdf-preview-dialog">
          <DialogHeader className="px-5 py-3 border-b border-slate-200">
            <DialogTitle className="font-display flex items-center justify-between">
              <span>{selectedRow?.code} — PDF Preview</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-sm" onClick={() => selectedRow && downloadPdf(selectedRow)}><DLIcon className="h-4 w-4 mr-1" /> Download</Button>
                <Button size="sm" variant="outline" className="rounded-sm" onClick={() => selectedRow && emailDoc(selectedRow)}><Mail className="h-4 w-4 mr-1" /> Email</Button>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="bg-slate-100 h-[78vh]">
            {previewUrl ? (
              <iframe title="pdf-preview" src={previewUrl} className="w-full h-full border-0" />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading...</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
