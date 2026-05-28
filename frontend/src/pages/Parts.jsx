import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Card, Th, Td, Empty, fmtDate, inr } from "@/components/erp/Primitives";
import ExportMenu from "@/components/erp/ExportMenu";
import { Plus, FileText, Download, History, Search, Cog, Layers } from "lucide-react";
import { toast } from "sonner";

const PROCESS_OPTIONS = ["Turning", "Milling", "Grinding", "Drilling", "Tapping", "Boring", "Heat Treatment", "Plating", "Wire EDM", "Surface Treatment", "Assembly", "Welding", "Other"];

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Parts() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [revOpen, setRevOpen] = useState(false);
  const [revPart, setRevPart] = useState(null);
  const [newRev, setNewRev] = useState({ revision: "", change_reason: "" });
  const [form, setForm] = useState({ process: [], tools_required: [], is_active: true });

  const load = async () => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const r = await api.get(`/parts${params}`); setRows(r.data || []);
      const c = await api.get("/customers"); setCustomers(c.data || []);
    } catch (e) { toast.error("Failed to load parts"); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ process: [], tools_required: [], is_active: true, current_revision: "Rev A" });
    setOpen(true);
  };
  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({ ...p, process: p.process || [], tools_required: p.tools_required || [] });
    setOpen(true);
  };

  const handleFile = async (key, filenameKey, file) => {
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setForm(p => ({ ...p, [key]: b64, [filenameKey]: file.name }));
    } catch (e) { toast.error("Upload failed"); }
  };

  const save = async () => {
    try {
      const cust = customers.find(c => c.id === form.customer_id);
      const payload = {
        ...form,
        customer_name: cust?.name || form.customer_name || "",
        cycle_time_minutes: Number(form.cycle_time_minutes || 0),
        weight_kg: Number(form.weight_kg || 0),
        raw_material_qty_per_part: Number(form.raw_material_qty_per_part || 0),
      };
      if (!payload.part_number || !payload.name) { toast.error("Part Number + Name required"); return; }
      if (editingId) {
        await api.put(`/parts/${editingId}`, payload);
        toast.success("Part updated");
      } else {
        await api.post("/parts", payload);
        toast.success("Part created");
      }
      setOpen(false); setEditingId(null);
      setForm({ process: [], tools_required: [], is_active: true });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const openRevDialog = (p) => { setRevPart(p); setNewRev({ revision: "", change_reason: "" }); setRevOpen(true); };
  const saveRevision = async () => {
    if (!newRev.revision) { toast.error("Revision label required"); return; }
    try {
      await api.post(`/parts/${revPart.id}/revisions`, newRev);
      toast.success("Revision promoted");
      setRevOpen(false); setRevPart(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const dlDrawing = async (pid, code, revision = null) => {
    try {
      const url = revision ? `/parts/${pid}/drawing?revision=${encodeURIComponent(revision)}` : `/parts/${pid}/drawing`;
      const r = await api.get(url, { responseType: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(r.data);
      a.download = `${code}${revision ? "_" + revision : ""}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error("No drawing on file"); }
  };
  const dlStep = async (pid, code, revision = null) => {
    try {
      const url = revision ? `/parts/${pid}/step?revision=${encodeURIComponent(revision)}` : `/parts/${pid}/step`;
      const r = await api.get(url, { responseType: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(r.data);
      a.download = `${code}${revision ? "_" + revision : ""}.step`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error("No STEP file on file"); }
  };

  const toggleProcess = (proc) => setForm(p => ({
    ...p,
    process: p.process?.includes(proc) ? p.process.filter(x => x !== proc) : [...(p.process || []), proc]
  }));

  return (
    <div data-testid="parts-page">
      <PageHeader
        overline="Production"
        title="Part Master"
        subtitle="Central part identity — every WO, BOM line, and inventory entry references a part here."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu collection="parts" />
            <Button onClick={openNew} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="add-part">
              <Plus className="h-4 w-4 mr-1" /> New Part
            </Button>
          </div>
        }
      />

      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()}
            placeholder="Search by part number, customer part number, or name…"
            className="rounded-sm border-0 focus-visible:ring-0"
          />
          <Button variant="outline" size="sm" className="rounded-sm" onClick={load}>Search</Button>
        </div>
      </Card>

      <Card>
        {rows.length === 0 ? <Empty label="No parts yet. Add your first part to start." /> : (
          <table className="w-full">
            <thead><tr><Th>Part #</Th><Th>Name</Th><Th>Customer</Th><Th>Material</Th><Th>Rev</Th><Th>Cycle</Th><Th>Wt (kg)</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-mono-tech text-xs"><button className="text-red-700 hover:underline" onClick={() => openEdit(p)}>{p.part_number}</button></Td>
                  <Td>{p.name}</Td>
                  <Td>{p.customer_name || "—"}</Td>
                  <Td className="text-xs">{p.material || "—"}{p.material_grade ? ` · ${p.material_grade}` : ""}</Td>
                  <Td><Badge variant="outline" className="rounded-sm text-[10px] font-mono-tech">{p.current_revision || "—"}</Badge></Td>
                  <Td className="text-xs">{p.cycle_time_minutes ? `${p.cycle_time_minutes}m` : "—"}</Td>
                  <Td className="text-xs">{p.weight_kg ? p.weight_kg.toFixed(3) : "—"}</Td>
                  <Td><Badge variant="outline" className={`rounded-sm uppercase text-[10px] ${p.is_active ? "border-emerald-600 text-emerald-700" : "border-slate-400 text-slate-600"}`}>{p.is_active ? "Active" : "Inactive"}</Badge></Td>
                  <Td>
                    <div className="flex gap-0.5">
                      {p.drawing_pdf_b64 && <Button size="icon" variant="ghost" className="h-7 w-7" title="Drawing PDF" onClick={() => dlDrawing(p.id, p.part_number)}><FileText className="h-3.5 w-3.5 text-red-600" /></Button>}
                      {p.step_file_b64 && <Button size="icon" variant="ghost" className="h-7 w-7" title="STEP / CAD" onClick={() => dlStep(p.id, p.part_number)}><Download className="h-3.5 w-3.5 text-blue-600" /></Button>}
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Revisions" onClick={() => openRevDialog(p)}><History className="h-3.5 w-3.5 text-slate-600" /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* New / Edit Part dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Cog className="h-4 w-4 text-red-600" /> {editingId ? "Edit Part" : "New Part"}</DialogTitle></DialogHeader>

          <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-500 border-b border-slate-200 pb-1 mt-3">Identity</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <Field label="Part Number *"><Input value={form.part_number || ""} onChange={e => setForm(p => ({ ...p, part_number: e.target.value }))} className="rounded-sm font-mono-tech" placeholder="DPX-2025-001" /></Field>
            <Field label="Customer Part #"><Input value={form.customer_part_number || ""} onChange={e => setForm(p => ({ ...p, customer_part_number: e.target.value }))} className="rounded-sm font-mono-tech" /></Field>
            <Field label="Current Revision"><Input value={form.current_revision || ""} onChange={e => setForm(p => ({ ...p, current_revision: e.target.value }))} className="rounded-sm" placeholder="Rev A" /></Field>
            <div className="md:col-span-2"><Field label="Name *"><Input value={form.name || ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="rounded-sm" /></Field></div>
            <Field label="Customer">
              <Select value={form.customer_id || ""} onValueChange={v => setForm(p => ({ ...p, customer_id: v }))}>
                <SelectTrigger className="rounded-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-3"><Field label="Description"><Textarea rows={2} value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="rounded-sm" /></Field></div>
          </div>

          <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-500 border-b border-slate-200 pb-1 mt-5">Engineering Specs</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <Field label="Material"><Input value={form.material || ""} onChange={e => setForm(p => ({ ...p, material: e.target.value }))} className="rounded-sm" placeholder="EN31, SS316, AISI 4140…" /></Field>
            <Field label="Material Grade"><Input value={form.material_grade || ""} onChange={e => setForm(p => ({ ...p, material_grade: e.target.value }))} className="rounded-sm" placeholder="Hardened / Forged / Annealed" /></Field>
            <Field label="Cycle Time (min/piece)"><Input type="number" step="0.1" value={form.cycle_time_minutes || ""} onChange={e => setForm(p => ({ ...p, cycle_time_minutes: e.target.value }))} className="rounded-sm font-mono-tech" /></Field>
            <Field label="Weight (kg)"><Input type="number" step="0.001" value={form.weight_kg || ""} onChange={e => setForm(p => ({ ...p, weight_kg: e.target.value }))} className="rounded-sm font-mono-tech" /></Field>
            <Field label="Raw Material Size"><Input value={form.raw_material_size || ""} onChange={e => setForm(p => ({ ...p, raw_material_size: e.target.value }))} className="rounded-sm" placeholder="Ø50 x 200mm bar" /></Field>
            <Field label="Raw Mat Qty / Part (kg)"><Input type="number" step="0.001" value={form.raw_material_qty_per_part || ""} onChange={e => setForm(p => ({ ...p, raw_material_qty_per_part: e.target.value }))} className="rounded-sm font-mono-tech" /></Field>
          </div>

          <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-500 border-b border-slate-200 pb-1 mt-5">Process</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {PROCESS_OPTIONS.map(proc => (
              <button key={proc} type="button" onClick={() => toggleProcess(proc)}
                className={`px-3 py-1 text-xs rounded-sm border transition-colors ${form.process?.includes(proc) ? "border-red-600 bg-red-50 text-red-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                {proc}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-500 border-b border-slate-200 pb-1 mt-5">Inspection & Tooling</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <Field label="Inspection Plan"><Textarea rows={3} value={form.inspection_plan || ""} onChange={e => setForm(p => ({ ...p, inspection_plan: e.target.value }))} className="rounded-sm" placeholder="Critical dimensions, gauges, tolerances…" /></Field>
            <Field label="Tools Required (comma-separated)">
              <Textarea rows={3} value={(form.tools_required || []).join(", ")} onChange={e => setForm(p => ({ ...p, tools_required: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} className="rounded-sm" placeholder="CNMG 120408, Snap gauge G1, Fixture FX-08…" />
            </Field>
          </div>

          <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-500 border-b border-slate-200 pb-1 mt-5">Drawing & CAD</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <Field label="Drawing PDF (uploaded for current revision)">
              <Input type="file" accept="application/pdf,.pdf" onChange={e => handleFile("drawing_pdf_b64", "drawing_filename", e.target.files?.[0])} className="rounded-sm text-xs" />
              {form.drawing_filename && <div className="text-xs text-emerald-700 mt-1 font-mono-tech">{form.drawing_filename}</div>}
            </Field>
            <Field label="STEP / CAD File">
              <Input type="file" accept=".step,.stp,.iges,.igs,.x_t,.x_b,.sat,.sldprt,.ipt,.prt" onChange={e => handleFile("step_file_b64", "step_filename", e.target.files?.[0])} className="rounded-sm text-xs" />
              {form.step_filename && <div className="text-xs text-emerald-700 mt-1 font-mono-tech">{form.step_filename}</div>}
            </Field>
          </div>

          <Field label="Notes" className="mt-4"><Textarea rows={2} value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-sm" /></Field>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700">{editingId ? "Update" : "Create"} Part</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revision dialog */}
      <Dialog open={revOpen} onOpenChange={setRevOpen}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><History className="h-4 w-4 text-slate-600" /> Revisions — {revPart?.part_number}</DialogTitle></DialogHeader>
          {revPart && (
            <>
              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold border-b border-slate-200 pb-1 mb-2">History</div>
              {revPart.revisions?.length ? (
                <div className="space-y-2 mb-4">
                  {revPart.revisions.slice().reverse().map((r, i) => (
                    <Card key={i} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono-tech font-semibold">{r.revision}</div>
                          <div className="text-xs text-slate-500">{fmtDate(r.effective_date)} · {r.created_by || "—"}</div>
                          {r.change_reason && <div className="text-sm mt-1">{r.change_reason}</div>}
                        </div>
                        <div className="flex gap-1">
                          {r.drawing_pdf_b64 && <Button size="sm" variant="outline" className="rounded-sm h-7 px-2 text-xs" onClick={() => dlDrawing(revPart.id, revPart.part_number, r.revision)}><FileText className="h-3 w-3 mr-1" /> PDF</Button>}
                          {r.step_file_b64 && <Button size="sm" variant="outline" className="rounded-sm h-7 px-2 text-xs" onClick={() => dlStep(revPart.id, revPart.part_number, r.revision)}><Download className="h-3 w-3 mr-1" /> STEP</Button>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : <Empty label="No revisions yet." />}

              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold border-b border-slate-200 pb-1 mb-2 mt-4">Promote New Revision</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="New Revision Label"><Input value={newRev.revision || ""} onChange={e => setNewRev(p => ({ ...p, revision: e.target.value }))} className="rounded-sm" placeholder="Rev B" /></Field>
                <Field label="Change Reason"><Input value={newRev.change_reason || ""} onChange={e => setNewRev(p => ({ ...p, change_reason: e.target.value }))} className="rounded-sm" placeholder="Customer revised dim X" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="New Drawing PDF (optional)">
                  <Input type="file" accept="application/pdf,.pdf" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const b64 = await fileToBase64(f); setNewRev(p => ({ ...p, drawing_pdf_b64: b64, drawing_filename: f.name })); }} className="rounded-sm text-xs" />
                  {newRev.drawing_filename && <div className="text-xs text-emerald-700 mt-1 font-mono-tech">{newRev.drawing_filename}</div>}
                </Field>
                <Field label="New STEP File (optional)">
                  <Input type="file" accept=".step,.stp,.iges,.igs" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const b64 = await fileToBase64(f); setNewRev(p => ({ ...p, step_file_b64: b64, step_filename: f.name })); }} className="rounded-sm text-xs" />
                  {newRev.step_filename && <div className="text-xs text-emerald-700 mt-1 font-mono-tech">{newRev.step_filename}</div>}
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" className="rounded-sm" onClick={() => setRevOpen(false)}>Cancel</Button>
                <Button onClick={saveRevision} className="rounded-sm bg-red-600 hover:bg-red-700">Promote Revision</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children, className = "" }) => (
  <div className={className}><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1">{children}</div></div>
);
