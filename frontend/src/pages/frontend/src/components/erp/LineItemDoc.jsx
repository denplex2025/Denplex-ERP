import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import { Plus, Edit, Trash2, X, MessageCircle, FileDown, Mail, Eye, Download as DLIcon, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Generic document with line-items page (used for Quotations, POs, Invoices)
 */
const _fileToB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
export default function LineItemDoc({
  testid, overline, title, subtitle, endpoint,
  partyEndpoint, partyField, partyNameField, partyKey, // e.g. "customer"
  numericPartyExtra,   // extra fields for invoice (gstin, interstate)
  statusOptions,
  whatsappPartyEndpoint, // to look up phone for whatsapp
  isInvoice = false,
  aiQuote = false,
}) {
  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ lines: [] });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewRow, setPreviewRow] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiForm, setAiForm] = useState({ customer_id: "", material: "", qty: 1, part_name: "" });
  const aiFileRef = useRef(null);
  const aiPhotoRef = useRef(null);

  const load = async () => {
    const r = await api.get(endpoint); setItems(r.data);
    const p = await api.get(partyEndpoint); setParties(p.data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ lines: [{ description: "", qty: 1, rate: 0, gst_rate: 18 }], status: "draft", date: new Date().toISOString().slice(0,10), is_interstate: false });
    setOpen(true);
  };
  const runEstimate = async () => {
    const f = aiFileRef.current?.files?.[0];
    if (!f) { toast.error("Attach a drawing first"); return; }
    setAiBusy(true); setAiResult(null);
    try {
      const b64 = await _fileToB64(f);
      const r = await api.post("/quotations/ai-estimate", { image_base64: b64, mime: f.type, material: aiForm.material, qty: Number(aiForm.qty) || 1, part_name: aiForm.part_name });
      setAiResult(r.data.estimate); toast.success("Estimate ready");
    } catch (e) { toast.error(e?.response?.data?.detail || "Estimate failed"); }
    setAiBusy(false);
  };
  const useEstimate = () => {
    if (!aiResult) return;
    const cust = parties.find(p => p.id === aiForm.customer_id);
    const desc = (aiResult.part_name || aiForm.part_name || "Machined part") + (aiForm.material ? ` (${aiForm.material})` : "");
    const notes = (aiResult.process_sequence?.length ? `Process: ${aiResult.process_sequence.join(" -> ")}. ` : "") + (aiResult.assumptions || "");
    setEditing(null);
    setForm({
      [`${partyKey}_id`]: aiForm.customer_id || "",
      [`${partyKey}_name`]: cust?.name || "",
      date: new Date().toISOString().slice(0,10), status: "draft", is_interstate: false,
      lines: [{ description: desc, qty: Number(aiForm.qty) || 1, rate: Number(aiResult.suggested_unit_price) || 0, gst_rate: 18 }],
      notes: notes.trim(),
    });
    setAiOpen(false); setOpen(true);
  };
  const downloadWord = async (fmt) => {
    if (!aiResult) return;
    setAiBusy(true);
    try {
      const cust = parties.find(p => p.id === aiForm.customer_id);
      const files = aiPhotoRef.current?.files ? Array.from(aiPhotoRef.current.files) : [];
      const photos = [];
      for (const f of files.slice(0, 3)) { photos.push(await _fileToB64(f)); }
      const desc = (aiResult.part_name || aiForm.part_name || "Machined part") + (aiForm.material ? ` (${aiForm.material})` : "");
      const title = aiResult.part_name ? `Quotation for ${aiResult.part_name}` : (aiForm.part_name ? `Quotation for ${aiForm.part_name}` : "Quotation");
      const payload = {
        format: fmt, customer: cust?.name || "", customer_addr: cust?.address || cust?.city || "",
        title, lines: [{ description: desc, qty: Number(aiForm.qty) || 1, rate: Number(aiResult.suggested_unit_price) || 0 }],
        highlights: aiResult.key_highlights || [], specs: aiResult.technical_specifications || [],
        cycle: aiResult.cycle_of_operation || [], inspection: aiResult.inspection_criteria || [],
        scope: aiResult.scope_of_buyer || [], photos,
      };
      const r = await api.post("/quotations/docx", payload, { responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a");
      a.href = url; a.download = `Quotation-${fmt}.docx`; a.click(); URL.revokeObjectURL(url);
      toast.success("Word quotation downloaded");
    } catch (e) { toast.error(e?.response?.data?.detail || "Word download failed"); }
    setAiBusy(false);
  };
  const openEdit = (row) => { setEditing(row); setForm({ ...row, lines: row.lines || [] }); setOpen(true); };
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setLine = (i, k, v) => setForm(p => {
    const ls = [...(p.lines || [])]; ls[i] = { ...ls[i], [k]: v }; return { ...p, lines: ls };
  });
  const addLine = () => setForm(p => ({ ...p, lines: [...(p.lines || []), { description:"", qty:1, rate:0, gst_rate:18 }] }));
  const rmLine = (i) => setForm(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }));

  const onPartyChange = (id) => {
    const p = parties.find(x => x.id === id);
    setForm(prev => ({
      ...prev,
      [`${partyKey}_id`]: id,
      [`${partyKey}_name`]: p?.name || "",
      ...(isInvoice ? { customer_gstin: p?.gstin || "" } : {}),
    }));
  };

  const subtotal = (form.lines || []).reduce((s, l) => s + (Number(l.qty)||0) * (Number(l.rate)||0), 0);
  const gstTotal = (form.lines || []).reduce((s, l) => s + (Number(l.qty)||0) * (Number(l.rate)||0) * (Number(l.gst_rate)||0)/100, 0);

  const save = async () => {
    try {
      const payload = {
        ...form,
        lines: (form.lines || []).map(l => ({ ...l, qty: Number(l.qty)||0, rate: Number(l.rate)||0, gst_rate: Number(l.gst_rate)||0 })),
      };
      if (editing) await api.put(`${endpoint}/${editing.id}`, payload);
      else await api.post(endpoint, payload);
      toast.success(editing ? "Updated" : "Created");
      setOpen(false); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (row) => {
    if (!window.confirm("Delete?")) return;
    try { await api.delete(`${endpoint}/${row.id}`); toast.success("Deleted"); load(); } catch (e) { toast.error("Failed"); }
  };

  const sendWhatsApp = (row) => {
    const party = parties.find(p => p.id === row[`${partyKey}_id`]);
    if (!party?.phone) { toast.error("No phone number on file for this party"); return; }
    const msg = encodeURIComponent(`Hi ${party.name},\n\nPlease find ${title.replace(/s$/, '')} ${row.code} attached.\nTotal: ₹${row.total}\n\n— Precision ERP`);
    window.open(`https://wa.me/${String(party.phone).replace(/\D/g,'')}?text=${msg}`, "_blank");
  };

  const sendTwilioWA = async (row) => {
    const party = parties.find(p => p.id === row[`${partyKey}_id`]);
    if (!party?.phone) { toast.error("No phone on file"); return; }
    const portalLink = row.po_ref ? `${window.location.origin}/portal?ref=${row.po_ref}` : `${window.location.origin}/portal`;
    const body = `Hi ${party.name}, your ${title.replace(/s$/, '')} ${row.code} is ready. Total ₹${row.total}.\nTrack: ${portalLink}`;
    try {
      await api.post("/whatsapp/send", { to_phone: party.phone, body });
      toast.success("WhatsApp queued via Twilio");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const downloadPdf = async (row) => {
    try {
      const r = await api.get(`${endpoint}/${row.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `${row.code}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { toast.error("PDF failed"); }
  };

  const previewPdf = async (row) => {
    try {
      const r = await api.get(`${endpoint}/${row.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(r.data);
      setPreviewUrl(url);
      setPreviewRow(row);
      setPreviewOpen(true);
    } catch (e) { toast.error("Preview failed"); }
  };

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(""); setPreviewRow(null); setPreviewOpen(false);
  };

  const emailDoc = async (row) => {
    const party = parties.find(p => p.id === row[`${partyKey}_id`]);
    const toEmail = party?.email; if (!toEmail) { toast.error("Customer email missing"); return; }
    try {
      const r = await api.get(`${endpoint}/${row.id}/pdf`, { responseType: "blob" });
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = String(reader.result).split(",")[1];
        try {
          const res = await api.post("/email/send", {
            to: [toEmail],
            subject: `${title.replace(/s$/, '')} ${row.code}`,
            html: `<p>Hi ${party.name},</p><p>Please find ${title.replace(/s$/, '')} <strong>${row.code}</strong> attached. Total: ₹${row.total}.</p><p>— Denplex Engineering Company</p>`,
            attachment_base64: b64,
            attachment_filename: `${row.code}.pdf`,
          });
          toast.success(`Sent to ${toEmail} from ${res.data?.from || "your mailbox"}`);
        } catch (e) { toast.error(e?.response?.data?.detail || "Email failed. Open Settings → Email Accounts."); }
      };
      reader.readAsDataURL(r.data);
    } catch (e) { toast.error("PDF failed"); }
  };

  return (
    <div data-testid={testid}>
      <PageHeader
        overline={overline} title={title} subtitle={subtitle}
        actions={<div className="flex gap-2">
          {aiQuote && <Button onClick={() => { setAiResult(null); setAiOpen(true); }} variant="outline" className="rounded-sm" data-testid={`${testid}-ai`}><Sparkles className="h-4 w-4 mr-1 text-red-600" /> AI Quote</Button>}
          <Button onClick={openNew} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid={`${testid}-new`}><Plus className="h-4 w-4 mr-1" /> New</Button>
        </div>}
      />
      <Card>
        {items.length === 0 ? <Empty label="No records yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <Th>Code</Th><Th>{partyField}</Th><Th>Date</Th><Th>Total</Th><Th>Status</Th><Th className="text-right">Actions</Th>
              </tr></thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td><span className="font-mono-tech text-xs">{r.code}</span></Td>
                    <Td>{r[partyNameField]}</Td>
                    <Td>{fmtDate(r.date)}</Td>
                    <Td className="font-mono-tech">{inr(r.total)}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => previewPdf(r)} title="Preview PDF" data-testid={`row-preview-${r.id}`}><Eye className="h-4 w-4 text-slate-700" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadPdf(r)} title="Download PDF" data-testid={`row-pdf-${r.id}`}><FileDown className="h-4 w-4 text-slate-700" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => emailDoc(r)} title="Email via your mailbox" data-testid={`row-email-${r.id}`}><Mail className="h-4 w-4 text-red-600" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => sendWhatsApp(r)} title="WhatsApp web"><MessageCircle className="h-4 w-4 text-emerald-600" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => sendTwilioWA(r)} title="WhatsApp via Twilio" data-testid={`row-twilio-${r.id}`}><MessageCircle className="h-4 w-4 text-emerald-800" strokeWidth={2.5} /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} data-testid={`row-edit-${r.id}`}><Edit className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(r)} data-testid={`row-delete-${r.id}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-4xl">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Edit" : "New"} {title.replace(/s$/, "")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label={`${partyField} *`}>
              <Select value={form[`${partyKey}_id`] || ""} onValueChange={onPartyChange}>
                <SelectTrigger className="rounded-sm" data-testid="party-select"><SelectValue placeholder={`Select ${partyField}`} /></SelectTrigger>
                <SelectContent>
                  {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date"><Input type="date" value={(form.date || "").slice(0,10)} onChange={e=>setF("date", e.target.value)} /></Field>
            {isInvoice && (
              <>
                <Field label="Place of Supply"><Input value={form.place_of_supply || ""} onChange={e=>setF("place_of_supply", e.target.value)} /></Field>
                <Field label="GST Type">
                  <Select value={String(!!form.is_interstate)} onValueChange={v=>setF("is_interstate", v === "true")}>
                    <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">Intra-state (CGST + SGST)</SelectItem>
                      <SelectItem value="true">Inter-state (IGST)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}
            <Field label="Status">
              <Select value={form.status || "draft"} onValueChange={v=>setF("status", v)}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Notes"><Input value={form.notes || ""} onChange={e=>setF("notes", e.target.value)} /></Field>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Line items</Label>
              <Button size="sm" variant="outline" className="rounded-sm" onClick={addLine} data-testid="add-line">+ Add line</Button>
            </div>
            <div className="border border-slate-200">
              <table className="w-full text-sm">
                <thead><tr>
                  <Th>Description</Th>{isInvoice && <Th>HSN</Th>}<Th>Qty</Th><Th>Rate</Th><Th>GST%</Th><Th>Amount</Th><Th></Th>
                </tr></thead>
                <tbody>
                  {(form.lines || []).map((l, i) => (
                    <tr key={i}>
                      <Td><Input value={l.description || ""} onChange={e=>setLine(i,"description",e.target.value)} className="rounded-sm h-8" data-testid={`line-desc-${i}`} /></Td>
                      {isInvoice && <Td><Input value={l.hsn || ""} onChange={e=>setLine(i,"hsn",e.target.value)} className="rounded-sm h-8 w-20" /></Td>}
                      <Td><Input type="number" value={l.qty} onChange={e=>setLine(i,"qty",e.target.value)} className="rounded-sm h-8 w-20" data-testid={`line-qty-${i}`} /></Td>
                      <Td><Input type="number" value={l.rate} onChange={e=>setLine(i,"rate",e.target.value)} className="rounded-sm h-8 w-24" data-testid={`line-rate-${i}`} /></Td>
                      <Td><Input type="number" value={l.gst_rate} onChange={e=>setLine(i,"gst_rate",e.target.value)} className="rounded-sm h-8 w-16" /></Td>
                      <Td className="font-mono-tech">{inr((Number(l.qty)||0)*(Number(l.rate)||0))}</Td>
                      <Td><Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>rmLine(i)}><X className="h-4 w-4 text-red-600" /></Button></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-8 mt-3 text-sm">
              <div className="text-slate-600">Subtotal: <span className="font-mono-tech text-slate-900">{inr(subtotal)}</span></div>
              <div className="text-slate-600">GST: <span className="font-mono-tech text-slate-900">{inr(gstTotal)}</span></div>
              <div className="font-semibold">Total: <span className="font-mono-tech">{inr(subtotal + gstTotal)}</span></div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-doc">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={(v)=>{ if (!v) closePreview(); }}>
        <DialogContent className="rounded-sm max-w-5xl p-0 overflow-hidden" data-testid="pdf-preview-dialog">
          <DialogHeader className="px-5 py-3 border-b border-slate-200">
            <DialogTitle className="font-display flex items-center justify-between">
              <span>{previewRow?.code} — PDF Preview</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-sm" onClick={() => previewRow && downloadPdf(previewRow)} data-testid="preview-download"><DLIcon className="h-4 w-4 mr-1" /> Download</Button>
                <Button size="sm" variant="outline" className="rounded-sm" onClick={() => previewRow && emailDoc(previewRow)}><Mail className="h-4 w-4 mr-1" /> Email</Button>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="bg-slate-100 h-[78vh]">
            {previewUrl ? (
              <iframe title="pdf-preview" src={previewUrl} className="w-full h-full border-0" data-testid="pdf-preview-iframe" />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading...</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {aiQuote && (
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="rounded-sm sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Sparkles className="w-5 h-5 text-red-600" /> AI Quote from Drawing</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer">
                <Select value={aiForm.customer_id || ""} onValueChange={v => setAiForm(p => ({ ...p, customer_id: v }))}>
                  <SelectTrigger className="rounded-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Quantity"><Input type="number" min="1" value={aiForm.qty} onChange={e => setAiForm(p => ({ ...p, qty: e.target.value }))} /></Field>
              <Field label="Material"><Input value={aiForm.material} onChange={e => setAiForm(p => ({ ...p, material: e.target.value }))} placeholder="e.g. EN31, SS304, MS" /></Field>
              <Field label="Part name (optional)"><Input value={aiForm.part_name} onChange={e => setAiForm(p => ({ ...p, part_name: e.target.value }))} /></Field>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-600">Drawing (PDF or image)</Label>
              <input ref={aiFileRef} type="file" accept=".pdf,image/*" className="mt-1.5 text-xs block w-full" />
            </div>
            <Button onClick={runEstimate} disabled={aiBusy} className="w-full rounded-sm bg-red-600 hover:bg-red-700">
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />} Estimate
            </Button>
            {aiResult && (
              <div className="border rounded-md p-3 bg-slate-50 text-sm space-y-1">
                <div className="font-semibold">{aiResult.part_name || aiForm.part_name || "Estimate"}</div>
                {aiResult.process_sequence?.length > 0 && <div className="text-xs text-slate-600">Process: {aiResult.process_sequence.join(" -> ")}</div>}
                <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-600 mt-1">
                  <div>Machining: {aiResult.machining_minutes_per_pc} min/pc</div>
                  <div>Material: Rs {aiResult.material_cost_per_pc}/pc</div>
                  <div>Machining cost: Rs {aiResult.machining_cost_per_pc}/pc</div>
                  <div className="font-semibold text-slate-800">Suggested: Rs {aiResult.suggested_unit_price}/pc</div>
                </div>
                {aiResult.assumptions && <div className="text-[11px] text-slate-400 mt-1">{aiResult.assumptions}</div>}
              </div>
            )}
            {aiResult && (
              <div className="border-t pt-3">
                <Label className="text-xs uppercase tracking-wider text-slate-600">Concept photos for the Word doc (optional, images)</Label>
                <input ref={aiPhotoRef} type="file" accept="image/*" multiple className="mt-1.5 text-xs block w-full" />
                <div className="flex gap-2 mt-3">
                  <Button onClick={() => downloadWord("general")} disabled={aiBusy} variant="outline" className="flex-1 rounded-sm"><FileDown className="h-4 w-4 mr-1" /> General Word</Button>
                  <Button onClick={() => downloadWord("techno")} disabled={aiBusy} variant="outline" className="flex-1 rounded-sm"><FileDown className="h-4 w-4 mr-1" /> Techno-Commercial</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setAiOpen(false)}>Cancel</Button>
            <Button onClick={useEstimate} disabled={!aiResult} className="rounded-sm bg-red-600 hover:bg-red-700">Use in Quotation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
