import { useEffect, useState, useMemo } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import ExportMenu from "@/components/erp/ExportMenu";
import Spinner from "@/components/erp/Spinner";
import { Plus, Edit, Trash2, X, Layers, ChevronRight, ChevronDown, Cog, Upload, Check, History, FileText, Download } from "lucide-react";
import { toast } from "sonner";

const BOM_TYPES = [
  { value: "assembly",     label: "Assembly (top-level product)" },
  { value: "subassembly",  label: "Sub-assembly" },
  { value: "standard_lib", label: "Standard / Library BOM (reusable)" },
];

const sourcingBadge = (s) => {
  if (s === "bought_out") return <Badge variant="outline" className="rounded-sm text-[10px] uppercase border-blue-600 text-blue-700">Bought-out</Badge>;
  if (s === "ready_made") return <Badge variant="outline" className="rounded-sm text-[10px] uppercase border-purple-600 text-purple-700">Ready-made</Badge>;
  if (s === "manufactured") return <Badge variant="outline" className="rounded-sm text-[10px] uppercase border-slate-500 text-slate-700">Mfg</Badge>;
  return null;
};

export default function BOMPage() {
  const [rows, setRows] = useState([]);
  const [parts, setParts] = useState([]);
  const [invItems, setInvItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ bom_type: "assembly", revision: "Rev A", is_default: true, is_active: true, lines: [] });
  const [explodeOpen, setExplodeOpen] = useState(false);
  const [explodeData, setExplodeData] = useState(null);
  const [explodeLoading, setExplodeLoading] = useState(false);
  const [explodeForRowId, setExplodeForRowId] = useState(null);
  // Revision dialog state (M.2)
  const [revOpen, setRevOpen] = useState(false);
  const [revBom, setRevBom] = useState(null);
  const [newRev, setNewRev] = useState({ revision: "", change_reason: "", customer_revision: "", customer_change_ref: "" });
  // BOM extraction (M.3b) — upload a drawing/STEP/Excel and pick which candidates to add
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractCandidates, setExtractCandidates] = useState([]);
  const [extractNotes, setExtractNotes] = useState([]);
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractChecked, setExtractChecked] = useState({});

  const load = async () => {
    try {
      const [b, p, i] = await Promise.all([
        api.get("/bom"),
        api.get("/parts"),
        api.get("/inventory/items"),
      ]);
      setRows(b.data || []);
      setParts(p.data || []);
      setInvItems(i.data || []);
    } catch (e) { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({
      bom_type: "assembly", revision: "Rev A", is_default: true, is_active: true,
      lines: [{ component_part_id: "", qty: 1, uom: "Nos", scrap_factor_pct: 0 }],
    });
    setOpen(true);
  };
  const openEdit = (r) => {
    setEditing(r);
    setForm({ ...r, lines: r.lines || [] });
    setOpen(true);
  };
  const fileToB64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setLine = (i, k, v) => setForm(p => { const ls = [...p.lines]; ls[i] = { ...ls[i], [k]: v }; return { ...p, lines: ls }; });
  const setLinePart = (i, partId) => {
    const part = parts.find(p => p.id === partId);
    setForm(p => {
      const ls = [...p.lines];
      ls[i] = {
        ...ls[i],
        component_part_id: partId,
        component_part_number: part?.part_number || "",
        component_part_name: part?.name || "",
        sourcing: part?.sourcing || "",
        uom: ls[i].uom || "Nos",
      };
      return { ...p, lines: ls };
    });
  };
  const addLine = () => setForm(p => ({ ...p, lines: [...(p.lines || []), { component_part_id: "", qty: 1, uom: "Nos", scrap_factor_pct: 0 }] }));
  const removeLine = (i) => setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }));

  const onParentPart = (partId) => {
    const part = parts.find(p => p.id === partId);
    setForm(p => ({
      ...p,
      parent_part_id: partId,
      parent_part_number: part?.part_number || "",
      product_name: p.product_name || part?.name || "",
    }));
  };

  const save = async () => {
    try {
      if (!form.product_name && !form.parent_part_id) { toast.error("Pick a parent part or enter product name"); return; }
      const payload = {
        ...form,
        product_name: form.product_name || parts.find(p => p.id === form.parent_part_id)?.name || "",
        lines: (form.lines || []).filter(l => l.component_part_id || l.item_id).map(l => ({
          ...l,
          qty: Number(l.qty || 0),
          scrap_factor_pct: Number(l.scrap_factor_pct || 0),
        })),
      };
      if (editing) await api.put(`/bom/${editing.id}`, payload);
      else await api.post("/bom", payload);
      toast.success("BOM saved"); setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (r) => {
    if (!window.confirm(`Delete BOM ${r.code}?`)) return;
    try { await api.delete(`/bom/${r.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error("Failed"); }
  };

  const onExtractFile = async (file) => {
    if (!file) return;
    setExtractBusy(true);
    setExtractCandidates([]); setExtractNotes([]);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/bom/extract", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setExtractCandidates(r.data?.candidates || []);
      setExtractNotes(r.data?.notes || []);
      // Default-check everything
      const init = {}; (r.data?.candidates || []).forEach((_, i) => init[i] = true);
      setExtractChecked(init);
      if ((r.data?.candidates || []).length === 0) toast.warning("No BOM lines extracted - see notes");
      else toast.success(`Extracted ${r.data?.count || 0} candidate lines`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Extract failed"); }
    finally { setExtractBusy(false); }
  };
  const addCheckedToBom = async () => {
    const toAdd = extractCandidates.filter((_, i) => extractChecked[i]);
    if (!toAdd.length) { toast.error("Tick at least one line"); return; }
    try {
      // 1. Bulk-create Part Master entries for ticked candidates (matching existing where possible)
      const payload = toAdd.map(c => ({
        part_number: c.part_number || "",
        name: c.name || "",
        material: c.material || "",
        sourcing_guess: c.sourcing_guess || "manufactured",
      }));
      const r = await api.post("/parts/bulk-from-candidates", payload);
      const mapped = r.data?.items || [];

      // 2. Build BOM lines referencing those Parts
      const newLines = toAdd.map((c, i) => {
        const m = mapped[i] || {};
        return {
          component_part_id: m.part_id || "",
          component_part_number: m.part_number || c.part_number || "",
          component_part_name: c.name || "",
          qty: c.qty || 1,
          uom: c.uom || "Nos",
          scrap_factor_pct: 0,
          sourcing: c.sourcing_guess || "",
          notes: c.source || "",
        };
      });
      setForm(p => ({ ...p, lines: [...(p.lines || []), ...newLines] }));

      // 3. Refresh Parts dropdown so new entries are selectable
      const pp = await api.get("/parts");
      setParts(pp.data || []);

      setExtractOpen(false);
      setExtractCandidates([]); setExtractChecked({});
      toast.success(`Added ${toAdd.length} BOM lines · created ${r.data?.created || 0} new parts · matched ${r.data?.matched || 0} existing`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to add"); }
  };
  const toggleAllExtract = (val) => {
    const next = {}; extractCandidates.forEach((_, i) => next[i] = val);
    setExtractChecked(next);
  };

  const openRevDialog = (bom) => {
    setRevBom(bom);
    setNewRev({ revision: "", change_reason: "", customer_revision: "", customer_change_ref: "" });
    setRevOpen(true);
  };
  const saveBomRevision = async () => {
    if (!newRev.revision) { toast.error("Revision label required"); return; }
    try {
      await api.post(`/bom/${revBom.id}/revisions`, newRev);
      toast.success(`Promoted ${newRev.revision}`);
      setRevOpen(false); setRevBom(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const dlBomDrawing = async (bid, code, revision = null) => {
    try {
      const url = revision ? `/bom/${bid}/drawing?revision=${encodeURIComponent(revision)}` : `/bom/${bid}/drawing`;
      const r = await api.get(url, { responseType: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(r.data);
      a.download = `${code}${revision ? "_" + revision : ""}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error("No drawing on file"); }
  };

  const explode = async (r) => {
    setExplodeData(null);
    setExplodeForRowId(r.id);
    setExplodeOpen(true);
    setExplodeLoading(true);
    try {
      const x = await api.get(`/bom/${r.id}/explode?levels=4`);
      setExplodeData(x.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to explode BOM");
      setExplodeOpen(false);
    } finally {
      setExplodeLoading(false);
      setExplodeForRowId(null);
    }
  };

  return (
    <div data-testid="bom-page">
      <PageHeader
        overline="Production"
        title="Bill of Materials"
        subtitle="Hierarchical BOM — Assembly → Sub-assembly → Standard Parts. Lines reference Part Master."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu collection="bom" />
            <Button onClick={openNew} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="new-bom">
              <Plus className="h-4 w-4 mr-1" /> New BOM
            </Button>
          </div>
        }
      />

      <Card>
        {rows.length === 0 ? <Empty label="No BOMs yet." /> : (
          <table className="w-full">
            <thead><tr><Th>Code</Th><Th>Parent Part</Th><Th>Product</Th><Th>Type</Th><Th>Rev</Th><Th>Lines</Th><Th>Created</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="font-mono-tech text-xs">{r.code}</Td>
                  <Td className="font-mono-tech text-xs">{r.parent_part_number || "—"}</Td>
                  <Td>{r.product_name}</Td>
                  <Td><Badge variant="outline" className="rounded-sm text-[10px] uppercase">{(r.bom_type || "assembly").replace("_", " ")}</Badge></Td>
                  <Td><Badge variant="outline" className="rounded-sm text-[10px] font-mono-tech">{r.revision || "—"}</Badge></Td>
                  <Td className="text-center">{r.lines?.length || 0}</Td>
                  <Td>{fmtDate(r.created_at)}</Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Explode (recursive view)" onClick={() => explode(r)} disabled={explodeLoading && explodeForRowId === r.id}>
                        {explodeLoading && explodeForRowId === r.id ? <Spinner size="sm" /> : <Layers className="h-3.5 w-3.5 text-blue-600" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Revisions" onClick={() => openRevDialog(r)}><History className="h-3.5 w-3.5 text-slate-600" /></Button>
                      {r.drawing_pdf_b64 && <Button size="icon" variant="ghost" className="h-7 w-7" title="Assembly drawing" onClick={() => dlBomDrawing(r.id, r.code)}><FileText className="h-3.5 w-3.5 text-red-600" /></Button>}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => del(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* New / Edit BOM dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Layers className="h-4 w-4 text-red-600" /> {editing ? "Edit BOM" : "New BOM"}</DialogTitle></DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div className="md:col-span-2">
              <Field label="Parent Part (from Part Master)">
                <Select value={form.parent_part_id || ""} onValueChange={onParentPart}>
                  <SelectTrigger className="rounded-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{parts.filter(p => p.is_active !== false).map(p => <SelectItem key={p.id} value={p.id}>{p.part_number} · {p.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="BOM Type">
              <Select value={form.bom_type || "assembly"} onValueChange={v => setF("bom_type", v)}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{BOM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2"><Field label="Product Name (defaults to parent part name)"><Input value={form.product_name || ""} onChange={e => setF("product_name", e.target.value)} className="rounded-sm" /></Field></div>
            <Field label="Revision"><Input value={form.revision || ""} onChange={e => setF("revision", e.target.value)} className="rounded-sm" placeholder="Rev A" /></Field>
            <div className="md:col-span-2"><Field label="Description"><Textarea rows={1} value={form.description || ""} onChange={e => setF("description", e.target.value)} className="rounded-sm" /></Field></div>
            <Field label="Design Code"><Input value={form.design_code || ""} onChange={e => setF("design_code", e.target.value)} className="rounded-sm font-mono-tech" /></Field>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider text-slate-600 font-semibold">Components</Label>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="rounded-sm h-7" onClick={() => setExtractOpen(true)} data-testid="extract-from-file">
                <Upload className="h-3 w-3 mr-1" /> Extract from File
              </Button>
              <Button size="sm" variant="outline" className="rounded-sm h-7" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add Line</Button>
            </div>
          </div>
          <div className="space-y-2 mt-2">
            {(form.lines || []).map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-1 items-start border border-slate-200 rounded-sm p-2">
                <div className="col-span-5">
                  <Select value={l.component_part_id || ""} onValueChange={v => setLinePart(i, v)}>
                    <SelectTrigger className="rounded-sm text-sm h-8"><SelectValue placeholder="Select part" /></SelectTrigger>
                    <SelectContent>{parts.filter(p => p.is_active !== false).map(p => <SelectItem key={p.id} value={p.id}>{p.part_number} · {p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-1"><Input type="number" step="0.01" value={l.qty || ""} onChange={e => setLine(i, "qty", e.target.value)} placeholder="Qty" className="rounded-sm text-sm h-8 font-mono-tech" /></div>
                <div className="col-span-1"><Input value={l.uom || "Nos"} onChange={e => setLine(i, "uom", e.target.value)} placeholder="Unit" className="rounded-sm text-sm h-8" /></div>
                <div className="col-span-1"><Input type="number" step="0.1" value={l.scrap_factor_pct || ""} onChange={e => setLine(i, "scrap_factor_pct", e.target.value)} placeholder="Scrap%" className="rounded-sm text-sm h-8" title="Extra material allowance %" /></div>
                <div className="col-span-2 flex items-center">{sourcingBadge(l.sourcing)}</div>
                <div className="col-span-1"><Input value={l.notes || ""} onChange={e => setLine(i, "notes", e.target.value)} placeholder="Note" className="rounded-sm text-sm h-8" /></div>
                <div className="col-span-1 flex"><Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></Button></div>
              </div>
            ))}
            {form.lines?.length === 0 && <div className="text-xs text-slate-500 italic">No components yet. Click + Add Line.</div>}
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700">{editing ? "Update" : "Create"} BOM</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOM Revisions dialog (M.2) */}
      <Dialog open={revOpen} onOpenChange={setRevOpen}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><History className="h-4 w-4 text-slate-600" /> Revisions {revBom ? `· ${revBom.code}` : ""}</DialogTitle></DialogHeader>
          {revBom && (
            <>
              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold border-b border-slate-200 pb-1 mb-2">History</div>
              {revBom.revision_history?.length ? (
                <div className="space-y-2 mb-4">
                  {revBom.revision_history.slice().reverse().map((r, i) => (
                    <Card key={i} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono-tech font-semibold">{r.revision}</span>
                            {r.customer_revision && <span className="text-xs px-1.5 py-0.5 rounded-sm border border-blue-600 text-blue-700 font-mono-tech">Customer: {r.customer_revision}</span>}
                          </div>
                          <div className="text-xs text-slate-500">{fmtDate(r.effective_date)} · {r.created_by || "—"}</div>
                          {r.change_reason && <div className="text-sm mt-1">{r.change_reason}</div>}
                          {r.customer_change_ref && <div className="text-xs text-slate-500 mt-0.5">Customer ref: <span className="font-mono-tech">{r.customer_change_ref}</span></div>}
                          <div className="text-xs text-slate-500 mt-0.5">{r.lines_snapshot?.length || 0} lines snapshotted</div>
                        </div>
                        <div className="flex gap-1">
                          {r.drawing_pdf_b64 && <Button size="sm" variant="outline" className="rounded-sm h-7 px-2 text-xs" onClick={() => dlBomDrawing(revBom.id, revBom.code, r.revision)}><Download className="h-3 w-3 mr-1" /> PDF</Button>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : <Empty label="No revisions yet." />}

              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold border-b border-slate-200 pb-1 mb-2 mt-4">Promote New Revision</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Our Revision Label *"><Input value={newRev.revision || ""} onChange={e => setNewRev(p => ({ ...p, revision: e.target.value }))} className="rounded-sm" placeholder="Rev B" /></Field>
                <Field label="Change Reason"><Input value={newRev.change_reason || ""} onChange={e => setNewRev(p => ({ ...p, change_reason: e.target.value }))} className="rounded-sm" placeholder="Customer revised dim X" /></Field>
                <Field label="Customer's Revision (if any)"><Input value={newRev.customer_revision || ""} onChange={e => setNewRev(p => ({ ...p, customer_revision: e.target.value }))} className="rounded-sm" placeholder="Astral Rev 03" /></Field>
                <Field label="Customer Change Ref"><Input value={newRev.customer_change_ref || ""} onChange={e => setNewRev(p => ({ ...p, customer_change_ref: e.target.value }))} className="rounded-sm" placeholder="ECN 1234" /></Field>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <Field label="Assembly Drawing PDF (optional)">
                  <Input type="file" accept="application/pdf,.pdf" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const b64 = await fileToB64(f); setNewRev(p => ({ ...p, drawing_pdf_b64: b64, drawing_filename: f.name })); }} className="rounded-sm text-xs" />
                  {newRev.drawing_filename && <div className="text-xs text-emerald-700 mt-1 font-mono-tech">{newRev.drawing_filename}</div>}
                </Field>
              </div>
              <div className="text-xs text-slate-500 mt-2">Snapshots current BOM lines into this revision. Future edits create new revisions.</div>
              <DialogFooter>
                <Button variant="outline" className="rounded-sm" onClick={() => setRevOpen(false)}>Cancel</Button>
                <Button onClick={saveBomRevision} className="rounded-sm bg-red-600 hover:bg-red-700">Promote Revision</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Extract-from-file dialog (M.3b) */}
      <Dialog open={extractOpen} onOpenChange={(o) => { setExtractOpen(o); if (!o) { setExtractCandidates([]); setExtractNotes([]); setExtractChecked({}); }}}>
        <DialogContent className="rounded-sm max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Upload className="h-4 w-4 text-blue-600" /> Extract BOM from a Drawing / STEP / Excel</DialogTitle></DialogHeader>
          <div className="text-sm text-slate-600 mb-3">
            Upload an assembly drawing PDF, STEP/STP file, or an Excel/CSV BOM export. We will extract candidate lines.
            <strong className="text-slate-800"> Tick the ones you want to make</strong> (for job-work parts that's usually a subset) and click Add.
            <div className="text-xs text-slate-500 mt-1">Supported: <code>.pdf .step .stp .xlsx .xls .csv</code> · SolidWorks/Solid Edge proprietary files need to be exported as Excel BOM first.</div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Input type="file" accept=".pdf,.step,.stp,.xlsx,.xls,.csv" onChange={e => onExtractFile(e.target.files?.[0])} className="rounded-sm text-sm" />
            {extractBusy && <Spinner size="sm" label="Parsing file..." />}
          </div>

          {extractNotes.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-sm p-2 mb-3">
              {extractNotes.map((n, i) => <div key={i} className="text-xs text-slate-600">- {n}</div>)}
            </div>
          )}

          {extractCandidates.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">Candidate Lines ({extractCandidates.length})</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="rounded-sm h-7 px-2 text-xs" onClick={() => toggleAllExtract(true)}>Tick all</Button>
                  <Button size="sm" variant="outline" className="rounded-sm h-7 px-2 text-xs" onClick={() => toggleAllExtract(false)}>Untick all</Button>
                </div>
              </div>
              <div className="border border-slate-200 rounded-sm divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
                {extractCandidates.map((c, i) => (
                  <label key={i} className="flex items-start gap-2 p-2 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={!!extractChecked[i]} onChange={e => setExtractChecked(p => ({ ...p, [i]: e.target.checked }))} className="mt-1" />
                    <div className="flex-1 grid grid-cols-12 gap-2 items-center text-sm">
                      <div className="col-span-3 font-mono-tech text-xs text-slate-700">{c.part_number || "-"}</div>
                      <div className="col-span-5">{c.name || "(no name)"}</div>
                      <div className="col-span-1 font-mono-tech text-xs text-right">{c.qty}</div>
                      <div className="col-span-1 text-xs text-slate-500">{c.uom}</div>
                      <div className="col-span-2 text-xs text-slate-500">{c.material || ""}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="text-xs text-slate-500 mt-2">After adding, map each line to a Part Master entry (or create new Parts for unmatched items).</div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setExtractOpen(false)}>Cancel</Button>
            <Button onClick={addCheckedToBom} className="rounded-sm bg-red-600 hover:bg-red-700" disabled={!extractCandidates.length}>
              <Check className="h-4 w-4 mr-1" /> Add ticked lines to BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Explode dialog */}
      <Dialog open={explodeOpen} onOpenChange={setExplodeOpen}>
        <DialogContent className="rounded-sm max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Layers className="h-4 w-4 text-blue-600" /> BOM Explosion {explodeData?.bom?.code ? `· ${explodeData.bom.code}` : ""}</DialogTitle></DialogHeader>
          {explodeLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Spinner size="xl" label="Computing BOM explosion..." />
              <div className="text-xs text-slate-500">Recursively expanding sub-assemblies down to 4 levels.</div>
            </div>
          ) : explodeData ? (
            <>
              <div className="text-sm text-slate-600 mb-3">Recursive view down to {explodeData.levels} levels. Quantities include scrap factor.</div>
              {explodeData.lines?.length === 0 ? (
                <Empty label="No lines found in this BOM." />
              ) : (
                <ExplodeTree lines={explodeData.lines} />
              )}
            </>
          ) : <Empty label="Nothing to show." />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExplodeTree({ lines }) {
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => <ExplodeNode key={i} line={line} />)}
    </div>
  );
}

function ExplodeNode({ line }) {
  const [open, setOpen] = useState(true);
  const hasChildren = line.children && line.children.length > 0;
  return (
    <div>
      <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-slate-50 rounded-sm" style={{ paddingLeft: `${line.level * 14}px` }}>
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="text-slate-400 hover:text-slate-700">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : <span className="w-3.5 inline-block"><Cog className="h-3 w-3 text-slate-300" /></span>}
        <span className="font-mono-tech text-xs text-slate-700">{line.part_number || "—"}</span>
        <span className="text-sm text-slate-800">· {line.part_name}</span>
        <span className="ml-auto text-xs font-mono-tech">{line.qty?.toFixed(3)} {line.uom}</span>
        {line.scrap_factor_pct > 0 && <span className="text-[10px] text-amber-700 ml-2">+{line.scrap_factor_pct}% scrap</span>}
        {sourcingBadge(line.sourcing)}
      </div>
      {hasChildren && open && <ExplodeTree lines={line.children} />}
    </div>
  );
}

const Field = ({ label, children, className = "" }) => (
  <div className={className}><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1">{children}</div></div>
);
