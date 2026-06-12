import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ShieldCheck, ClipboardList } from "lucide-react";
import StatusBadge from "@/components/erp/StatusBadge";
import { toast } from "sonner";

const Sel = ({ value, onChange, options }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);
const Field = ({ label, children, className = "" }) => (
  <div className={className}><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1">{children}</div></div>
);

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
        </TabsList>
        <TabsContent value="ncr"><NCRRegister /></TabsContent>
        <TabsContent value="capa"><CAPARegister /></TabsContent>
      </Tabs>
    </div>
  );
}
