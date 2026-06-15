import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ShieldCheck, ClipboardList, FileDown, Wrench, Truck, Gauge, FileText, FolderOpen, Save, FilePlus, ExternalLink, Search, Bold, Italic, Underline, List, ListOrdered, Heading2, Heading3, FileType2, FileSpreadsheet, ClipboardCheck, CheckCircle2, XCircle, Clock, X, Table2 } from "lucide-react";
import StatusBadge from "@/components/erp/StatusBadge";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const Sel = ({ value, onChange, options }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);
const Field = ({ label, children, className = "" }) => (
  <div className={className}><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1">{children}</div></div>
);
const dlPdf = async (path, name) => {
  try { const r = await api.get(path, { responseType: "blob" }); const u = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }
  catch (e) { toast.error("PDF download failed"); }
};
const Pill = ({ color, children }) => {
  const m = { red:"bg-red-50 text-red-700 border-red-300", amber:"bg-amber-50 text-amber-700 border-amber-300", emerald:"bg-emerald-50 text-emerald-700 border-emerald-300", slate:"bg-slate-50 text-slate-600 border-slate-300" };
  return <span className={`text-[10px] uppercase font-semibold tracking-wider border rounded-sm px-1.5 py-0.5 ${m[color]||m.slate}`}>{children}</span>;
};
const calStatus = (due) => {
  if (!due) return { label: "no due date", color: "slate" };
  const days = Math.ceil((new Date(due) - new Date()) / 86400000);
  if (days < 0) return { label: `overdue ${-days}d`, color: "red" };
  if (days <= 30) return { label: `due ${days}d`, color: "amber" };
  return { label: "ok", color: "emerald" };
};

// ---------------- NCR register ----------------
const NCR_SOURCES = [["production","Production"],["internal_audit","Internal Audit"],["customer_complaint","Customer Complaint"],["supplier","Supplier"],["other","Other"]].map(([value,label])=>({value,label}));
const DISPOSITIONS = [["rework","Rework"],["repair","Repair"],["regrade","Regrade"],["scrap","Scrap"],["use_as_is","Use as is"],["return_to_supplier","Return to supplier"]].map(([value,label])=>({value,label}));
const emptyNcr = { date: new Date().toISOString().slice(0,10), source:"production", process_name:"", product:"", part_number:"", customer_name:"", supplier_name:"", qty:0, description:"", root_cause:"", correction:"", disposition:"rework", status:"open", remarks:"" };

function NCRRegister() {
  const [list, setList] = useState([]); const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null); const [form, setForm] = useState(emptyNcr); const [saving, setSaving] = useState(false);
  const refresh = () => api.get("/ncrs").then(r=>setList(Array.isArray(r.data)?r.data:[])).catch(()=>setList([]));
  useEffect(() => { refresh(); }, []);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const openNew = () => { setEditId(null); setForm(emptyNcr); setOpen(true); };
  const openEdit = (n) => { setEditId(n.id); setForm({...emptyNcr, ...n, date:(n.date||"").slice(0,10)}); setOpen(true); };
  const save = async () => {
    if (!form.description.trim()) { toast.error("Describe the non-conformity"); return; }
    setSaving(true);
    try { editId ? await api.put(`/ncrs/${editId}`, form) : await api.post("/ncrs", form); toast.success("NCR saved"); setOpen(false); refresh(); }
    catch(e){ toast.error(e?.response?.data?.detail || "Failed"); } setSaving(false);
  };
  const del = async (n) => { if(!window.confirm(`Delete ${n.code}?`)) return; await api.delete(`/ncrs/${n.id}`); refresh(); };
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">Non-conformance reports (F/PRD/03) — raise, assign disposition, link a CAPA, and close.</p>
        <Button onClick={openNew} className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-1" /> New NCR</Button>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-2">NCR #</th><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Source</th>
            <th className="text-left px-4 py-2">Product / Process</th><th className="text-left px-4 py-2">Non-conformity</th>
            <th className="text-left px-4 py-2">Disposition</th><th className="text-left px-4 py-2">CAPA</th><th className="text-left px-4 py-2">Status</th><th className="text-right px-4 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {list.length===0 ? <tr><td colSpan={9} className="text-center py-10 text-slate-400">No NCRs yet.</td></tr> : list.map(n=>(
              <tr key={n.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{n.code}</td>
                <td className="px-4 py-2">{(n.date||"").slice(0,10)}</td>
                <td className="px-4 py-2 capitalize">{(n.source||"").replace(/_/g," ")}</td>
                <td className="px-4 py-2"><div className="text-slate-700">{n.product||"—"}</div><div className="text-xs text-slate-400">{n.process_name}</div></td>
                <td className="px-4 py-2 max-w-xs truncate" title={n.description}>{n.description}</td>
                <td className="px-4 py-2 capitalize">{(n.disposition||"").replace(/_/g," ")}</td>
                <td className="px-4 py-2 text-xs text-red-600">{n.capa_code||"—"}</td>
                <td className="px-4 py-2"><StatusBadge status={n.status} /></td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="PDF" onClick={()=>dlPdf(`/ncrs/${n.id}/pdf`, `${n.code}.pdf`)}><FileDown className="h-4 w-4 text-slate-700" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>openEdit(n)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>del(n)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? `Edit ${form.code||"NCR"}` : "New Non-Conformance Report"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={form.date} onChange={e=>set("date",e.target.value)} /></Field>
            <Field label="Source"><Sel value={form.source} onChange={v=>set("source",v)} options={NCR_SOURCES} /></Field>
            <Field label="Process"><Input value={form.process_name} onChange={e=>set("process_name",e.target.value)} placeholder="VMC, Welding…" /></Field>
            <Field label="Product"><Input value={form.product} onChange={e=>set("product",e.target.value)} /></Field>
            <Field label="Part Number"><Input value={form.part_number} onChange={e=>set("part_number",e.target.value)} /></Field>
            <Field label="Qty"><Input type="number" value={form.qty} onChange={e=>set("qty",e.target.value)} /></Field>
            {form.source==="customer_complaint" && <Field label="Customer"><Input value={form.customer_name} onChange={e=>set("customer_name",e.target.value)} /></Field>}
            {form.source==="supplier" && <Field label="Supplier"><Input value={form.supplier_name} onChange={e=>set("supplier_name",e.target.value)} /></Field>}
            <Field label="Description of non-conformity" className="col-span-2"><Textarea rows={2} value={form.description} onChange={e=>set("description",e.target.value)} /></Field>
            <Field label="Root cause" className="col-span-2"><Textarea rows={2} value={form.root_cause} onChange={e=>set("root_cause",e.target.value)} /></Field>
            <Field label="Correction (immediate)" className="col-span-2"><Textarea rows={2} value={form.correction} onChange={e=>set("correction",e.target.value)} /></Field>
            <Field label="Disposition"><Sel value={form.disposition} onChange={v=>set("disposition",v)} options={DISPOSITIONS} /></Field>
            <Field label="Status"><Sel value={form.status} onChange={v=>set("status",v)} options={[{value:"open",label:"Open"},{value:"closed",label:"Closed"}]} /></Field>
            <Field label="Remarks" className="col-span-2"><Textarea rows={2} value={form.remarks} onChange={e=>set("remarks",e.target.value)} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving?"Saving…":(editId?"Update":"Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- CAPA register ----------------
const CAPA_SOURCES = [["ncr","NCR"],["internal_audit","Internal Audit"],["customer_complaint","Customer Complaint"],["management_review","Management Review"],["other","Other"]].map(([value,label])=>({value,label}));
const CAPA_STATUS = [["open","Open"],["in_progress","In Progress"],["verified","Verified"],["closed","Closed"]].map(([value,label])=>({value,label}));
const emptyCapa = { date:new Date().toISOString().slice(0,10), source:"ncr", ncr_id:"", nonconformity:"", root_cause:"", corrective_action:"", preventive_action:"", responsibility:"", target_date:"", risk_assessment:"", effectiveness:"", iso_clause:"8.7, 10.2", status:"open", remarks:"" };

function CAPARegister() {
  const [list, setList] = useState([]); const [ncrs, setNcrs] = useState([]); const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null); const [form, setForm] = useState(emptyCapa); const [saving, setSaving] = useState(false);
  const refresh = () => api.get("/capas").then(r=>setList(Array.isArray(r.data)?r.data:[])).catch(()=>setList([]));
  useEffect(() => { refresh(); api.get("/ncrs",{silent:true}).then(r=>setNcrs(Array.isArray(r.data)?r.data:[])).catch(()=>{}); }, []);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const openNew = () => { setEditId(null); setForm(emptyCapa); setOpen(true); };
  const openEdit = (c) => { setEditId(c.id); setForm({...emptyCapa, ...c, date:(c.date||"").slice(0,10), target_date:(c.target_date||"").slice(0,10)}); setOpen(true); };
  const save = async () => {
    if (!form.nonconformity.trim()) { toast.error("Describe the non-conformity"); return; }
    setSaving(true);
    try { editId ? await api.put(`/capas/${editId}`, form) : await api.post("/capas", form); toast.success("CAPA saved"); setOpen(false); refresh(); }
    catch(e){ toast.error(e?.response?.data?.detail || "Failed"); } setSaving(false);
  };
  const del = async (c) => { if(!window.confirm(`Delete ${c.code}?`)) return; await api.delete(`/capas/${c.id}`); refresh(); };
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">Corrective &amp; preventive actions (F/QMS/10, ISO 8.7/10.2) — root cause → action → verify effectiveness.</p>
        <Button onClick={openNew} className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-1" /> New CAPA</Button>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-2">CAPA #</th><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Source</th>
            <th className="text-left px-4 py-2">Non-conformity</th><th className="text-left px-4 py-2">Responsibility</th><th className="text-left px-4 py-2">Target</th><th className="text-left px-4 py-2">Status</th><th className="text-right px-4 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {list.length===0 ? <tr><td colSpan={8} className="text-center py-10 text-slate-400">No CAPAs yet.</td></tr> : list.map(c=>(
              <tr key={c.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{c.code}{c.ncr_code && <div className="text-xs text-slate-400">← {c.ncr_code}</div>}</td>
                <td className="px-4 py-2">{(c.date||"").slice(0,10)}</td>
                <td className="px-4 py-2 capitalize">{(c.source||"").replace(/_/g," ")}</td>
                <td className="px-4 py-2 max-w-xs truncate" title={c.nonconformity}>{c.nonconformity}</td>
                <td className="px-4 py-2">{c.responsibility||"—"}</td>
                <td className="px-4 py-2">{(c.target_date||"").slice(0,10)||"—"}</td>
                <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="PDF" onClick={()=>dlPdf(`/capas/${c.id}/pdf`, `${c.code}.pdf`)}><FileDown className="h-4 w-4 text-slate-700" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>del(c)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? `Edit ${form.code||"CAPA"}` : "New Corrective / Preventive Action"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={form.date} onChange={e=>set("date",e.target.value)} /></Field>
            <Field label="Source"><Sel value={form.source} onChange={v=>set("source",v)} options={CAPA_SOURCES} /></Field>
            {form.source==="ncr" && <Field label="Link NCR" className="col-span-2">
              <select value={form.ncr_id} onChange={e=>set("ncr_id",e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                <option value="">— none —</option>{ncrs.map(n=><option key={n.id} value={n.id}>{n.code} · {(n.description||"").slice(0,40)}</option>)}
              </select></Field>}
            <Field label="Non-conformity" className="col-span-2"><Textarea rows={2} value={form.nonconformity} onChange={e=>set("nonconformity",e.target.value)} /></Field>
            <Field label="Root cause analysis" className="col-span-2"><Textarea rows={2} value={form.root_cause} onChange={e=>set("root_cause",e.target.value)} /></Field>
            <Field label="Corrective action" className="col-span-2"><Textarea rows={2} value={form.corrective_action} onChange={e=>set("corrective_action",e.target.value)} /></Field>
            <Field label="Preventive action" className="col-span-2"><Textarea rows={2} value={form.preventive_action} onChange={e=>set("preventive_action",e.target.value)} /></Field>
            <Field label="Responsibility"><Input value={form.responsibility} onChange={e=>set("responsibility",e.target.value)} placeholder="Person / HOD" /></Field>
            <Field label="Target date"><Input type="date" value={form.target_date} onChange={e=>set("target_date",e.target.value)} /></Field>
            <Field label="Risk assessment" className="col-span-2"><Textarea rows={2} value={form.risk_assessment} onChange={e=>set("risk_assessment",e.target.value)} /></Field>
            <Field label="Effectiveness verification" className="col-span-2"><Textarea rows={2} value={form.effectiveness} onChange={e=>set("effectiveness",e.target.value)} /></Field>
            <Field label="ISO Clause"><Input value={form.iso_clause} onChange={e=>set("iso_clause",e.target.value)} /></Field>
            <Field label="Status"><Sel value={form.status} onChange={v=>set("status",v)} options={CAPA_STATUS} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving?"Saving…":(editId?"Update":"Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ---------------- Calibration register (F/QCD/03) ----------------
const emptyInst = { instrument_name:"", make:"", range:"", identification_no:"", location:"", calibration_date:"", due_date:"", calibrated_by:"", frequency_months:12, remarks:"" };
function CalibrationRegister() {
  const [list,setList]=useState([]); const [open,setOpen]=useState(false);
  const [editId,setEditId]=useState(null); const [form,setForm]=useState(emptyInst); const [saving,setSaving]=useState(false);
  const refresh=()=>api.get("/instruments").then(r=>setList(Array.isArray(r.data)?r.data:[])).catch(()=>setList([]));
  useEffect(()=>{refresh();},[]);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const setCal=(v)=>{ const f={...form,calibration_date:v}; if(v && form.frequency_months){ const d=new Date(v); d.setMonth(d.getMonth()+Number(form.frequency_months)); d.setDate(d.getDate()-1); f.due_date=d.toISOString().slice(0,10);} setForm(f); };
  const openNew=()=>{setEditId(null);setForm(emptyInst);setOpen(true);};
  const openEdit=(i)=>{setEditId(i.id);setForm({...emptyInst,...i,calibration_date:(i.calibration_date||"").slice(0,10),due_date:(i.due_date||"").slice(0,10)});setOpen(true);};
  const save=async()=>{ if(!form.instrument_name.trim()){toast.error("Instrument name required");return;} setSaving(true);
    try{ editId?await api.put(`/instruments/${editId}`,form):await api.post("/instruments",form); toast.success("Saved"); setOpen(false); refresh(); }catch(e){toast.error("Failed");} setSaving(false); };
  const del=async(i)=>{ if(!window.confirm(`Delete ${i.instrument_name}?`))return; await api.delete(`/instruments/${i.id}`); refresh(); };
  const dueSoon=list.filter(i=>{const c=calStatus(i.due_date).color; return c==="red"||c==="amber";}).length;
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">Instruments & calibration status (F/QCD/03). {dueSoon>0 && <span className="text-red-600 font-medium">{dueSoon} due/overdue.</span>}</p>
        <Button onClick={openNew} className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-1" /> New Instrument</Button>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500"><tr>
          <th className="text-left px-4 py-2">Instrument</th><th className="text-left px-4 py-2">Make</th><th className="text-left px-4 py-2">Range</th>
          <th className="text-left px-4 py-2">ID No.</th><th className="text-left px-4 py-2">Location</th><th className="text-left px-4 py-2">Cal. Date</th>
          <th className="text-left px-4 py-2">Due Date</th><th className="text-left px-4 py-2">Status</th><th className="text-right px-4 py-2">Actions</th></tr></thead>
        <tbody>{list.length===0?<tr><td colSpan={9} className="text-center py-10 text-slate-400">No instruments yet.</td></tr>:list.map(i=>{const st=calStatus(i.due_date);return(
          <tr key={i.id} className="border-b hover:bg-slate-50">
            <td className="px-4 py-2 font-medium">{i.instrument_name}</td><td className="px-4 py-2">{i.make||"—"}</td><td className="px-4 py-2">{i.range||"—"}</td>
            <td className="px-4 py-2 font-mono-tech text-xs">{i.identification_no||"—"}</td><td className="px-4 py-2">{i.location||"—"}</td>
            <td className="px-4 py-2">{(i.calibration_date||"").slice(0,10)||"—"}</td><td className="px-4 py-2">{(i.due_date||"").slice(0,10)||"—"}</td>
            <td className="px-4 py-2"><Pill color={st.color}>{st.label}</Pill></td>
            <td className="px-4 py-2 text-right whitespace-nowrap">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>openEdit(i)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>del(i)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
          </tr>);})}</tbody></table></CardContent></Card>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{editId?"Edit Instrument":"New Instrument"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instrument name" className="col-span-2"><Input value={form.instrument_name} onChange={e=>set("instrument_name",e.target.value)} placeholder="Analog External Micrometer" /></Field>
          <Field label="Make"><Input value={form.make} onChange={e=>set("make",e.target.value)} placeholder="YURI / Mitutoyo" /></Field>
          <Field label="Range"><Input value={form.range} onChange={e=>set("range",e.target.value)} placeholder="0 to 25 mm" /></Field>
          <Field label="Identification No."><Input value={form.identification_no} onChange={e=>set("identification_no",e.target.value)} /></Field>
          <Field label="Location"><Input value={form.location} onChange={e=>set("location",e.target.value)} placeholder="Vatva / Santej" /></Field>
          <Field label="Calibration date"><Input type="date" value={form.calibration_date} onChange={e=>setCal(e.target.value)} /></Field>
          <Field label="Frequency (months)"><Input type="number" value={form.frequency_months} onChange={e=>set("frequency_months",e.target.value)} /></Field>
          <Field label="Due date"><Input type="date" value={form.due_date} onChange={e=>set("due_date",e.target.value)} /></Field>
          <Field label="Calibrated by"><Input value={form.calibrated_by} onChange={e=>set("calibrated_by",e.target.value)} placeholder="Prism Calibration" /></Field>
          <Field label="Remarks" className="col-span-2"><Textarea rows={2} value={form.remarks} onChange={e=>set("remarks",e.target.value)} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving?"Saving…":(editId?"Update":"Create")}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>);
}

// ---------------- Supplier Quality (F/PUR/03 + F/PUR/04) ----------------
const SUP_TYPES=[["manufacturer","Manufacturer"],["trader","Trader"],["job_work","Job Work"],["service","Service"]].map(([value,label])=>({value,label}));
const CRITERIA=[["A","Past Experience"],["B","Supplier Registration"],["C","Sample Request"],["D","Trial Order"],["E","Market Reputation"],["F","Equipment Manufacturer"],["G","Monopoly / Customer Approved"]];
const emptyAp={ name:"", address:"", material_service:"", supplier_type:"trader", approval_criteria:[], approval_date:new Date().toISOString().slice(0,10), status:"approved", remarks:"" };
const emptyEval={ supplier_name:"", period:"", quality_score:0, delivery_score:0, cost_score:0, responsiveness_score:0, system_score:0, evaluated_by:"", date:new Date().toISOString().slice(0,10), remarks:"" };

function SupplierQuality() {
  const [view,setView]=useState("approved");
  const [aps,setAps]=useState([]); const [evals,setEvals]=useState([]);
  const [apOpen,setApOpen]=useState(false); const [apId,setApId]=useState(null); const [ap,setAp]=useState(emptyAp); const [apSaving,setApSaving]=useState(false);
  const [evOpen,setEvOpen]=useState(false); const [evId,setEvId]=useState(null); const [ev,setEv]=useState(emptyEval); const [evSaving,setEvSaving]=useState(false);
  const loadAp=()=>api.get("/approved-suppliers").then(r=>setAps(Array.isArray(r.data)?r.data:[])).catch(()=>setAps([]));
  const loadEv=()=>api.get("/supplier-evaluations").then(r=>setEvals(Array.isArray(r.data)?r.data:[])).catch(()=>setEvals([]));
  useEffect(()=>{loadAp();loadEv();},[]);
  const toggleCrit=(c)=>setAp(p=>({...p,approval_criteria:p.approval_criteria.includes(c)?p.approval_criteria.filter(x=>x!==c):[...p.approval_criteria,c]}));
  const saveAp=async()=>{ if(!ap.name.trim()){toast.error("Supplier name required");return;} setApSaving(true);
    try{ apId?await api.put(`/approved-suppliers/${apId}`,ap):await api.post("/approved-suppliers",ap); toast.success("Saved"); setApOpen(false); loadAp(); }catch(e){toast.error("Failed");} setApSaving(false); };
  const saveEv=async()=>{ if(!ev.supplier_name.trim()){toast.error("Supplier required");return;} setEvSaving(true);
    try{ evId?await api.put(`/supplier-evaluations/${evId}`,ev):await api.post("/supplier-evaluations",ev); toast.success("Saved"); setEvOpen(false); loadEv(); }catch(e){toast.error("Failed");} setEvSaving(false); };
  const ratingColor=(r)=>r==="A"?"emerald":r==="B"?"amber":"red";
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={view==="approved"?"default":"outline"} className={view==="approved"?"bg-red-600 hover:bg-red-700":""} onClick={()=>setView("approved")}>Approved Suppliers</Button>
        <Button size="sm" variant={view==="eval"?"default":"outline"} className={view==="eval"?"bg-red-600 hover:bg-red-700":""} onClick={()=>setView("eval")}>Performance Evaluation</Button>
      </div>
      {view==="approved"?(<>
        <div className="flex justify-between items-center"><p className="text-sm text-slate-500">Approved supplier / external-provider list (F/PUR/03).</p>
          <Button onClick={()=>{setApId(null);setAp(emptyAp);setApOpen(true);}} className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-1" /> New Supplier</Button></div>
        <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-2">Supplier</th><th className="text-left px-4 py-2">Material / Service</th><th className="text-left px-4 py-2">Type</th>
            <th className="text-left px-4 py-2">Criteria</th><th className="text-left px-4 py-2">Approved</th><th className="text-left px-4 py-2">Status</th><th className="text-right px-4 py-2">Actions</th></tr></thead>
          <tbody>{aps.length===0?<tr><td colSpan={7} className="text-center py-10 text-slate-400">No approved suppliers yet.</td></tr>:aps.map(a=>(
            <tr key={a.id} className="border-b hover:bg-slate-50">
              <td className="px-4 py-2"><div className="font-medium">{a.name}</div><div className="text-xs text-slate-400">{a.address}</div></td>
              <td className="px-4 py-2">{a.material_service||"—"}</td><td className="px-4 py-2 capitalize">{(a.supplier_type||"").replace(/_/g," ")}</td>
              <td className="px-4 py-2 font-mono-tech text-xs">{(a.approval_criteria||[]).join(", ")||"—"}</td><td className="px-4 py-2">{(a.approval_date||"").slice(0,10)}</td>
              <td className="px-4 py-2"><StatusBadge status={a.status} /></td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>{setApId(a.id);setAp({...emptyAp,...a,approval_date:(a.approval_date||"").slice(0,10)});setApOpen(true);}}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={async()=>{if(window.confirm(`Delete ${a.name}?`)){await api.delete(`/approved-suppliers/${a.id}`);loadAp();}}}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
            </tr>))}</tbody></table></CardContent></Card>
      </>):(<>
        <div className="flex justify-between items-center"><p className="text-sm text-slate-500">Supplier performance evaluation (F/PUR/04) — score 0–10 each; rating auto: A≥85%, B≥60%, C below.</p>
          <Button onClick={()=>{setEvId(null);setEv(emptyEval);setEvOpen(true);}} className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-1" /> New Evaluation</Button></div>
        <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-2">Supplier</th><th className="text-left px-4 py-2">Period</th><th className="text-center px-2 py-2">Qual</th><th className="text-center px-2 py-2">Del</th>
            <th className="text-center px-2 py-2">Cost</th><th className="text-center px-2 py-2">Resp</th><th className="text-center px-2 py-2">Sys</th>
            <th className="text-right px-4 py-2">Total %</th><th className="text-center px-4 py-2">Rating</th><th className="text-right px-4 py-2">Actions</th></tr></thead>
          <tbody>{evals.length===0?<tr><td colSpan={10} className="text-center py-10 text-slate-400">No evaluations yet.</td></tr>:evals.map(e=>(
            <tr key={e.id} className="border-b hover:bg-slate-50">
              <td className="px-4 py-2 font-medium">{e.supplier_name}</td><td className="px-4 py-2">{e.period||"—"}</td>
              <td className="px-2 py-2 text-center">{e.quality_score}</td><td className="px-2 py-2 text-center">{e.delivery_score}</td><td className="px-2 py-2 text-center">{e.cost_score}</td>
              <td className="px-2 py-2 text-center">{e.responsiveness_score}</td><td className="px-2 py-2 text-center">{e.system_score}</td>
              <td className="px-4 py-2 text-right font-semibold">{e.total_pct}%</td><td className="px-4 py-2 text-center"><Pill color={ratingColor(e.rating)}>{e.rating||"—"}</Pill></td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>{setEvId(e.id);setEv({...emptyEval,...e,date:(e.date||"").slice(0,10)});setEvOpen(true);}}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={async()=>{if(window.confirm("Delete?")){await api.delete(`/supplier-evaluations/${e.id}`);loadEv();}}}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>
            </tr>))}</tbody></table></CardContent></Card>
      </>)}

      <Dialog open={apOpen} onOpenChange={setApOpen}><DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{apId?"Edit Supplier":"New Approved Supplier"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier name" className="col-span-2"><Input value={ap.name} onChange={e=>setAp(p=>({...p,name:e.target.value}))} /></Field>
          <Field label="Address" className="col-span-2"><Input value={ap.address} onChange={e=>setAp(p=>({...p,address:e.target.value}))} /></Field>
          <Field label="Material / Service"><Input value={ap.material_service} onChange={e=>setAp(p=>({...p,material_service:e.target.value}))} placeholder="S.S. / VMC Machining" /></Field>
          <Field label="Type"><Sel value={ap.supplier_type} onChange={v=>setAp(p=>({...p,supplier_type:v}))} options={SUP_TYPES} /></Field>
          <Field label="Approval criteria" className="col-span-2"><div className="flex flex-wrap gap-1">
            {CRITERIA.map(([c,lbl])=><button type="button" key={c} onClick={()=>toggleCrit(c)} title={lbl} className={`text-xs border rounded-sm px-2 py-1 ${ap.approval_criteria.includes(c)?"bg-red-600 text-white border-red-600":"bg-white border-slate-300 text-slate-600"}`}>{c}</button>)}
          </div><div className="text-[10px] text-slate-400 mt-1">{CRITERIA.map(([c,l])=>`${c}=${l}`).join(" · ")}</div></Field>
          <Field label="Approval date"><Input type="date" value={ap.approval_date} onChange={e=>setAp(p=>({...p,approval_date:e.target.value}))} /></Field>
          <Field label="Status"><Sel value={ap.status} onChange={v=>setAp(p=>({...p,status:v}))} options={[{value:"approved",label:"Approved"},{value:"on_hold",label:"On Hold"},{value:"removed",label:"Removed"}]} /></Field>
          <Field label="Remarks" className="col-span-2"><Textarea rows={2} value={ap.remarks} onChange={e=>setAp(p=>({...p,remarks:e.target.value}))} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={()=>setApOpen(false)} disabled={apSaving}>Cancel</Button>
          <Button onClick={saveAp} disabled={apSaving} className="bg-red-600 hover:bg-red-700 text-white">{apSaving?"Saving…":(apId?"Update":"Create")}</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={evOpen} onOpenChange={setEvOpen}><DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{evId?"Edit Evaluation":"New Supplier Evaluation"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier"><Input value={ev.supplier_name} onChange={e=>setEv(p=>({...p,supplier_name:e.target.value}))} /></Field>
          <Field label="Period"><Input value={ev.period} onChange={e=>setEv(p=>({...p,period:e.target.value}))} placeholder="2025-26 / Q1" /></Field>
          <Field label="Quality (0–10)"><Input type="number" min="0" max="10" value={ev.quality_score} onChange={e=>setEv(p=>({...p,quality_score:e.target.value}))} /></Field>
          <Field label="Delivery (0–10)"><Input type="number" min="0" max="10" value={ev.delivery_score} onChange={e=>setEv(p=>({...p,delivery_score:e.target.value}))} /></Field>
          <Field label="Cost (0–10)"><Input type="number" min="0" max="10" value={ev.cost_score} onChange={e=>setEv(p=>({...p,cost_score:e.target.value}))} /></Field>
          <Field label="Responsiveness (0–10)"><Input type="number" min="0" max="10" value={ev.responsiveness_score} onChange={e=>setEv(p=>({...p,responsiveness_score:e.target.value}))} /></Field>
          <Field label="System / QMS (0–10)"><Input type="number" min="0" max="10" value={ev.system_score} onChange={e=>setEv(p=>({...p,system_score:e.target.value}))} /></Field>
          <Field label="Date"><Input type="date" value={ev.date} onChange={e=>setEv(p=>({...p,date:e.target.value}))} /></Field>
          <Field label="Remarks" className="col-span-2"><Textarea rows={2} value={ev.remarks} onChange={e=>setEv(p=>({...p,remarks:e.target.value}))} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={()=>setEvOpen(false)} disabled={evSaving}>Cancel</Button>
          <Button onClick={saveEv} disabled={evSaving} className="bg-red-600 hover:bg-red-700 text-white">{evSaving?"Saving…":(evId?"Update":"Create")}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>);
}

// ---------------- ISO Documents library (Master + FY 26-27) ----------------
const ISO_CATEGORIES = ["Manual", "QMS Procedure", "Department Procedure", "Work Instruction", "Policy", "Quality Objective", "Master List", "Annexure", "Register", "EHS", "Inspection", "General"];
const catRank = (c) => { const i = ISO_CATEGORIES.indexOf(c); return i < 0 ? 99 : i; };

function RichEditor({ value, onInput }) {
  const ref = useState(() => ({ current: null }))[0];
  useEffect(() => { if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || ""; }, []); // eslint-disable-line
  const cmd = (c, v = null) => { document.execCommand(c, false, v); ref.current && ref.current.focus(); onInput && onInput(ref.current.innerHTML); };
  const Btn = ({ icon: Icon, c, v, title }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); cmd(c, v); }}
      className="h-8 w-8 inline-flex items-center justify-center rounded-sm hover:bg-slate-200 text-slate-700"><Icon className="w-4 h-4" /></button>
  );
  return (
    <div className="border border-slate-300 rounded-md overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1 flex-wrap">
        <Btn icon={Bold} c="bold" title="Bold" /><Btn icon={Italic} c="italic" title="Italic" /><Btn icon={Underline} c="underline" title="Underline" />
        <span className="w-px h-5 bg-slate-300 mx-1" />
        <Btn icon={Heading2} c="formatBlock" v="<h2>" title="Heading" /><Btn icon={Heading3} c="formatBlock" v="<h3>" title="Sub-heading" />
        <Btn icon={FileType2} c="formatBlock" v="<p>" title="Normal text" />
        <span className="w-px h-5 bg-slate-300 mx-1" />
        <Btn icon={List} c="insertUnorderedList" title="Bullet list" /><Btn icon={ListOrdered} c="insertOrderedList" title="Numbered list" />
      </div>
      <div ref={(el) => (ref.current = el)} contentEditable suppressContentEditableWarning
        onInput={(e) => onInput && onInput(e.currentTarget.innerHTML)}
        className="prose prose-sm max-w-none p-4 min-h-[420px] max-h-[60vh] overflow-y-auto focus:outline-none text-sm leading-relaxed bg-white" />
    </div>
  );
}

const DEPARTMENTS = ["Production", "QC", "Design", "Purchase", "Store", "HR", "Marketing", "Maintenance", "Management"];
const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly", "as_required"];
const COL_TYPES = ["text", "number", "date", "select", "textarea"];

// ---- Register: add/edit a single entry (row), fields driven by the template columns ----
function RegisterEntryDialog({ open, onClose, template, entry, onSave }) {
  const cols = template?.columns || [];
  const [date, setDate] = useState("");
  const [data, setData] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) { setDate(entry?.date ? entry.date.slice(0, 10) : new Date().toISOString().slice(0, 10)); setData(entry?.data ? { ...entry.data } : {}); }
  }, [open, entry]);
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const submit = async () => { setSaving(true); await onSave({ date, data }); setSaving(false); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{entry ? "Edit entry" : "New entry"} · {template?.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" /></Field>
          {cols.map((c) => (
            <Field key={c.key} label={c.label} className={c.type === "textarea" ? "md:col-span-2" : ""}>
              {c.type === "textarea" ? <Textarea value={data[c.key] || ""} onChange={(e) => set(c.key, e.target.value)} rows={2} />
                : c.type === "select" ? <Sel value={data[c.key] || ""} onChange={(v) => set(c.key, v)} options={[{ value: "", label: "—" }, ...(c.options || []).map((o) => ({ value: o, label: o }))]} />
                : <Input type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"} value={data[c.key] || ""} onChange={(e) => set(c.key, e.target.value)} className="h-9" />}
            </Field>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save entry"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Register: the live data table (free data entry) + Excel/PDF export ----
function RegisterView({ template, onDeleted, canManage }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const cols = template.columns || [];
  const load = async () => { setLoading(true); try { const r = await api.get(`/registers/${template.id}/entries`); setEntries(r.data || []); } catch (e) {} setLoading(false); };
  useEffect(() => { load(); setEdit(null); }, [template.id]); // eslint-disable-line
  const saveEntry = async ({ date, data }) => {
    try {
      if (edit) await api.put(`/registers/${template.id}/entries/${edit.id}`, { date, data });
      else await api.post(`/registers/${template.id}/entries`, { date, data });
      setOpen(false); setEdit(null); await load(); toast.success("Entry saved");
    } catch (e) { toast.error("Could not save entry"); }
  };
  const delEntry = async (id) => { if (!window.confirm("Delete this entry?")) return; try { await api.delete(`/registers/${template.id}/entries/${id}`); await load(); } catch (e) { toast.error("Delete failed"); } };
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-red-600 font-semibold flex items-center gap-2">{template.department} · Register{template.code ? ` · ${template.code}` : ""}<Pill color="slate">{template.frequency}</Pill></div>
          <h2 className="text-lg font-bold">{template.name}</h2>
          {template.description ? <p className="text-xs text-slate-500">{template.description}</p> : null}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Add entry</Button>
          <Button size="sm" variant="outline" onClick={() => dlPdf(`/registers/${template.id}/export/xlsx`, `${(template.code || template.name).replace(/\//g, "-")}.xlsx`)}><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
          <Button size="sm" variant="outline" onClick={() => dlPdf(`/registers/${template.id}/export/pdf`, `${(template.code || template.name).replace(/\//g, "-")}.pdf`)}><FileDown className="w-4 h-4 mr-1" /> PDF</Button>
          {canManage && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onDeleted(template)}><Trash2 className="w-4 h-4" /></Button>}
        </div>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="p-2">Date</th>{cols.map((c) => <th key={c.key} className="p-2">{c.label}</th>)}<th className="p-2 w-16"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={cols.length + 2} className="p-4 text-slate-400">Loading…</td></tr>}
            {!loading && entries.length === 0 && <tr><td colSpan={cols.length + 2} className="p-4 text-slate-400">No entries yet. Click “Add entry”.</td></tr>}
            {entries.map((e) => (
              <tr key={e.id} className="border-b hover:bg-slate-50">
                <td className="p-2 whitespace-nowrap">{(e.date || "").slice(0, 10)}</td>
                {cols.map((c) => <td key={c.key} className="p-2">{String(e.data?.[c.key] ?? "")}</td>)}
                <td className="p-2 text-right whitespace-nowrap">
                  <button className="text-slate-400 hover:text-slate-700 mr-2" onClick={() => { setEdit(e); setOpen(true); }}><Pencil className="w-3.5 h-3.5 inline" /></button>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => delEntry(e.id)}><Trash2 className="w-3.5 h-3.5 inline" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
      <RegisterEntryDialog open={open} onClose={() => { setOpen(false); setEdit(null); }} template={template} entry={edit} onSave={saveEntry} />
    </div>
  );
}

function DocumentsLibrary() {
  const { user } = useAuth();
  const isApprover = ["admin", "manager"].includes(user?.role);
  const [dept, setDept] = useState("Production");
  const [docs, setDocs] = useState([]);
  const [registers, setRegisters] = useState([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);              // { kind: 'doc'|'register', id }
  const [selDoc, setSelDoc] = useState(null);
  const [draft, setDraft] = useState("");
  const [meta, setMeta] = useState({ title: "", code: "", category: "General", department: "" });
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [nf, setNf] = useState({ title: "", code: "", category: "General" });
  const [regOpen, setRegOpen] = useState(false);
  const [rf, setRf] = useState({ name: "", code: "", frequency: "daily", columns: [{ label: "", type: "text" }] });
  const [pendOpen, setPendOpen] = useState(false);
  const [pending, setPending] = useState([]);

  const loadAll = async () => {
    try { const [d, r] = await Promise.all([api.get(`/iso-documents`), api.get(`/registers`)]); setDocs(d.data || []); setRegisters(r.data || []); } catch (e) {}
  };
  const loadPending = async () => { try { const r = await api.get(`/iso-documents?status=pending_approval`); setPending(r.data || []); } catch (e) {} };
  useEffect(() => { loadAll(); loadPending(); }, []); // eslint-disable-line
  useEffect(() => { setSel(null); setSelDoc(null); }, [dept]);

  const selReg = sel?.kind === "register" ? registers.find((r) => r.id === sel.id) : null;

  const openDoc = async (id) => {
    try { const r = await api.get(`/iso-documents/${id}`); setSelDoc(r.data); setDraft(r.data.html_content || ""); setMeta({ title: r.data.title || "", code: r.data.code || "", category: r.data.category || "General", department: r.data.department || dept }); setSel({ kind: "doc", id }); }
    catch (e) { toast.error("Could not open document"); }
  };
  const saveDoc = async () => {
    if (!selDoc) return; setSaving(true);
    try {
      const r = await api.put(`/iso-documents/${selDoc.id}`, { ...meta, html_content: draft });
      if (r.data?.status === "pending_approval") toast.success("Saved & sent for admin approval");
      else toast.success("Saved as new revision");
      setSelDoc(r.data); await loadAll(); await loadPending();
    } catch (e) { toast.error("Save failed"); } setSaving(false);
  };
  const approveDoc = async (id) => { try { await api.post(`/iso-documents/${id}/approve`); toast.success("Approved — new revision published"); await loadAll(); await loadPending(); if (selDoc?.id === id) openDoc(id); } catch (e) { toast.error(e?.response?.data?.detail || "Approve failed"); } };
  const rejectDoc = async (id) => { try { await api.post(`/iso-documents/${id}/reject`); toast.success("Change rejected"); await loadAll(); await loadPending(); if (selDoc?.id === id) openDoc(id); } catch (e) { toast.error("Reject failed"); } };
  const delDoc = async () => { if (!selDoc || !window.confirm("Delete this document?")) return; try { await api.delete(`/iso-documents/${selDoc.id}`); setSel(null); setSelDoc(null); await loadAll(); } catch (e) { toast.error("Delete failed"); } };

  const createDoc = async () => {
    if (!nf.title.trim()) { toast.error("Title required"); return; }
    try { const r = await api.post(`/iso-documents`, { ...nf, department: dept, doc_type: "text", html_content: "" }); setNewOpen(false); setNf({ title: "", code: "", category: "General" }); await loadAll(); openDoc(r.data.id); }
    catch (e) { toast.error("Create failed"); }
  };
  const createRegister = async () => {
    if (!rf.name.trim()) { toast.error("Register name required"); return; }
    const columns = rf.columns.filter((c) => c.label.trim()).map((c) => ({ key: c.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), label: c.label.trim(), type: c.type, options: (c.options || "").split(",").map((s) => s.trim()).filter(Boolean) }));
    if (!columns.length) { toast.error("Add at least one column"); return; }
    try { await api.post(`/registers`, { name: rf.name, code: rf.code, department: dept, frequency: rf.frequency, columns }); setRegOpen(false); setRf({ name: "", code: "", frequency: "daily", columns: [{ label: "", type: "text" }] }); await loadAll(); toast.success("Register created"); }
    catch (e) { toast.error("Create failed"); }
  };
  const deleteRegister = async (t) => { if (!window.confirm(`Delete register “${t.name}” and all its entries?`)) return; try { await api.delete(`/registers/${t.id}`); setSel(null); await loadAll(); } catch (e) { toast.error("Delete failed"); } };

  const deptDocs = docs.filter((d) => (d.department || "Management") === dept && (!q || `${d.title} ${d.code} ${d.category}`.toLowerCase().includes(q.toLowerCase())));
  const deptRegs = registers.filter((r) => r.department === dept && (!q || `${r.name} ${r.code}`.toLowerCase().includes(q.toLowerCase())));
  const grouped = {};
  deptDocs.forEach((d) => { (grouped[d.category] = grouped[d.category] || []).push(d); });
  const cats = Object.keys(grouped).sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {DEPARTMENTS.map((d) => (
          <button key={d} onClick={() => setDept(d)} className={`px-2.5 py-1 text-xs rounded-sm font-medium border ${dept === d ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{d}</button>
        ))}
        {isApprover && <button onClick={() => { loadPending(); setPendOpen(true); }} className="ml-auto px-2.5 py-1 text-xs rounded-sm font-medium border bg-amber-50 text-amber-700 border-amber-300 inline-flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> Approvals{pending.length ? ` (${pending.length})` : ""}</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[330px_1fr] gap-3">
        <Card><CardContent className="p-2">
          <div className="relative mb-2"><Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${dept}…`} className="pl-8 h-9" /></div>
          <div className="flex gap-1.5 mb-2">
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setNewOpen(true)}><FilePlus className="w-3.5 h-3.5 mr-1" /> Document</Button>
            {isApprover && <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setRegOpen(true)}><Table2 className="w-3.5 h-3.5 mr-1" /> Register</Button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {deptRegs.length > 0 && <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold px-1 py-1 flex items-center gap-1"><Table2 className="w-3 h-3" /> Registers (live data)</div>}
            {deptRegs.map((r) => (
              <button key={r.id} onClick={() => setSel({ kind: "register", id: r.id })} className={`w-full text-left px-2 py-1.5 rounded-sm text-sm flex items-center gap-2 ${sel?.kind === "register" && sel.id === r.id ? "bg-emerald-50 text-emerald-800" : "hover:bg-slate-100 text-slate-700"}`}>
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-500" /><span className="truncate flex-1">{r.name}</span>{r.code ? <span className="text-[10px] text-slate-400 shrink-0">{r.code}</span> : null}
              </button>
            ))}
            {cats.map((cat) => (
              <div key={cat} className="mb-1 mt-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-1 py-1 flex items-center gap-1"><FolderOpen className="w-3 h-3" /> {cat} <span className="text-slate-300">· {grouped[cat].length}</span></div>
                {grouped[cat].map((d) => (
                  <button key={d.id} onClick={() => openDoc(d.id)} className={`w-full text-left px-2 py-1.5 rounded-sm text-sm flex items-center gap-2 ${sel?.kind === "doc" && sel.id === d.id ? "bg-red-50 text-red-800" : "hover:bg-slate-100 text-slate-700"}`}>
                    {d.doc_type === "file" ? <FileDown className="w-3.5 h-3.5 shrink-0 text-slate-400" /> : <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
                    <span className="truncate flex-1">{d.title}</span>
                    {d.status === "pending_approval" ? <Clock className="w-3 h-3 text-amber-500 shrink-0" /> : null}
                    {d.code ? <span className="text-[10px] text-slate-400 shrink-0">{d.code}</span> : null}
                  </button>
                ))}
              </div>
            ))}
            {deptRegs.length === 0 && cats.length === 0 && <div className="text-sm text-slate-400 p-3">Nothing in {dept} yet.</div>}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-3">
          {!sel && <div className="h-[60vh] flex flex-col items-center justify-center text-center text-slate-400 gap-2"><FileText className="w-10 h-10" /><div className="text-sm">Select a register to enter data, or a document to view/edit.</div></div>}
          {selReg && <RegisterView template={selReg} onDeleted={deleteRegister} canManage={isApprover} />}
          {sel?.kind === "doc" && selDoc && selDoc.doc_type === "file" && (
            <div className="space-y-4">
              <div><div className="text-xs uppercase tracking-wider text-red-600 font-semibold">{selDoc.category}{selDoc.code ? ` · ${selDoc.code}` : ""}</div><h2 className="text-lg font-bold">{selDoc.title}</h2></div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 flex flex-col items-center gap-3">
                <FileDown className="w-8 h-8 text-slate-400" />
                <div>This is a {selDoc.file_name?.split(".").pop()?.toUpperCase() || "binary"} file. Open or download it from Google Drive.</div>
                {selDoc.source_url ? <a href={selDoc.source_url} target="_blank" rel="noreferrer"><Button size="sm"><ExternalLink className="w-4 h-4 mr-1" /> Open / download in Drive</Button></a>
                  : <Button size="sm" onClick={() => dlPdf(`/iso-documents/${selDoc.id}/file`, selDoc.file_name || selDoc.title)}><FileDown className="w-4 h-4 mr-1" /> Download original</Button>}
              </div>
              {isApprover && <div className="flex justify-end"><Button size="sm" variant="ghost" className="text-red-600" onClick={delDoc}><Trash2 className="w-4 h-4 mr-1" /> Remove</Button></div>}
            </div>
          )}
          {sel?.kind === "doc" && selDoc && selDoc.doc_type !== "file" && (
            <div className="space-y-3">
              {selDoc.status === "pending_approval" && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> A change is pending approval{selDoc.submitted_by ? ` (submitted by ${selDoc.submitted_by})` : ""}.</span>
                  {isApprover && <span className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approveDoc(selDoc.id)}><CheckCircle2 className="w-4 h-4 mr-1" /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => rejectDoc(selDoc.id)}><XCircle className="w-4 h-4 mr-1" /> Reject</Button>
                  </span>}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_150px] gap-2">
                <Field label="Title"><Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} className="h-9" /></Field>
                <Field label="Doc No"><Input value={meta.code} onChange={(e) => setMeta({ ...meta, code: e.target.value })} className="h-9" /></Field>
                <Field label="Department"><Sel value={meta.department} onChange={(v) => setMeta({ ...meta, department: v })} options={DEPARTMENTS.map((c) => ({ value: c, label: c }))} /></Field>
              </div>
              <RichEditor key={selDoc.id} value={draft} onInput={setDraft} />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-slate-400">Rev {selDoc.revision || 0}{selDoc.approved_by ? ` · approved by ${selDoc.approved_by}` : ""}{!isApprover ? " · edits need admin approval" : ""}</div>
                <div className="flex gap-2">
                  {isApprover && <Button size="sm" variant="ghost" className="text-red-600" onClick={delDoc}><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>}
                  <Button size="sm" variant="outline" onClick={() => dlPdf(`/iso-documents/${selDoc.id}/docx`, `${(meta.code || meta.title).replace(/\//g, "-")}.docx`)}><FileDown className="w-4 h-4 mr-1" /> Word</Button>
                  <Button size="sm" variant="outline" onClick={() => dlPdf(`/iso-documents/${selDoc.id}/pdf`, `${(meta.code || meta.title).replace(/\//g, "-")}.pdf`)}><FileDown className="w-4 h-4 mr-1" /> PDF</Button>
                  <Button size="sm" onClick={saveDoc} disabled={saving}><Save className="w-4 h-4 mr-1" /> {saving ? "Saving…" : isApprover ? "Save revision" : "Submit"}</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent></Card>
      </div>

      {/* New document */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent><DialogHeader><DialogTitle>New document · {dept}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Title"><Input value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Doc No"><Input value={nf.code} onChange={(e) => setNf({ ...nf, code: e.target.value })} placeholder="F/QMS/05" /></Field>
              <Field label="Category"><Sel value={nf.category} onChange={(v) => setNf({ ...nf, category: v })} options={ISO_CATEGORIES.map((c) => ({ value: c, label: c }))} /></Field>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button><Button onClick={createDoc}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New register */}
      <Dialog open={regOpen} onOpenChange={setRegOpen}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>New register · {dept}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px] gap-2">
              <Field label="Register name"><Input value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} placeholder="Daily Production Report" /></Field>
              <Field label="Doc No"><Input value={rf.code} onChange={(e) => setRf({ ...rf, code: e.target.value })} placeholder="F/PRD/02" /></Field>
              <Field label="Frequency"><Sel value={rf.frequency} onChange={(v) => setRf({ ...rf, frequency: v })} options={FREQUENCIES.map((f) => ({ value: f, label: f }))} /></Field>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-600">Columns</Label>
              <div className="space-y-2 mt-1">
                {rf.columns.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input value={c.label} onChange={(e) => { const cs = [...rf.columns]; cs[i] = { ...cs[i], label: e.target.value }; setRf({ ...rf, columns: cs }); }} placeholder="Column label" className="h-9 flex-1" />
                    <div className="w-32"><Sel value={c.type} onChange={(v) => { const cs = [...rf.columns]; cs[i] = { ...cs[i], type: v }; setRf({ ...rf, columns: cs }); }} options={COL_TYPES.map((t) => ({ value: t, label: t }))} /></div>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => setRf({ ...rf, columns: rf.columns.filter((_, j) => j !== i) })}><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setRf({ ...rf, columns: [...rf.columns, { label: "", type: "text" }] })}><Plus className="w-4 h-4 mr-1" /> Add column</Button>
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRegOpen(false)}>Cancel</Button><Button onClick={createRegister}>Create register</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approvals */}
      <Dialog open={pendOpen} onOpenChange={setPendOpen}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Pending approvals</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {pending.length === 0 && <div className="text-sm text-slate-400 p-3">Nothing waiting for approval.</div>}
            {pending.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                <div><div className="text-sm font-medium">{d.title}</div><div className="text-xs text-slate-400">{d.code} · {d.department} · submitted by {d.submitted_by || "—"}</div></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setPendOpen(false); setDept(d.department || "Management"); openDoc(d.id); }}>Review</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approveDoc(d.id)}><CheckCircle2 className="w-4 h-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => rejectDoc(d.id)}><XCircle className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ISO() {
  const [tab, setTab] = useState("ncr");
  return (
    <div className="space-y-4 p-2 md:p-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-red-600 font-semibold">Quality · ISO 9001:2015</div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-red-600" /> ISO QMS</h1>
        <p className="text-sm text-slate-500">Quality Management System registers, aligned to your documented formats.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100 flex-wrap h-auto">
          <TabsTrigger value="ncr" className="rounded-sm"><ClipboardList className="w-4 h-4 mr-1" /> NCR</TabsTrigger>
          <TabsTrigger value="capa" className="rounded-sm"><ShieldCheck className="w-4 h-4 mr-1" /> CAPA</TabsTrigger>
          <TabsTrigger value="calibration" className="rounded-sm"><Gauge className="w-4 h-4 mr-1" /> Calibration</TabsTrigger>
          <TabsTrigger value="suppliers" className="rounded-sm"><Truck className="w-4 h-4 mr-1" /> Supplier Quality</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-sm"><FileText className="w-4 h-4 mr-1" /> Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="ncr"><NCRRegister /></TabsContent>
        <TabsContent value="capa"><CAPARegister /></TabsContent>
        <TabsContent value="calibration"><CalibrationRegister /></TabsContent>
        <TabsContent value="suppliers"><SupplierQuality /></TabsContent>
        <TabsContent value="documents"><DocumentsLibrary /></TabsContent>
      </Tabs>
    </div>
  );
}
