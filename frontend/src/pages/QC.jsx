import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import { Plus, Trash2, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function QC() {
  const [items, setItems] = useState([]);
  const [wos, setWos] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ result: "pass", photos: [] });

  const load = async () => {
    const [a, b] = await Promise.all([api.get("/qc-reports"), api.get("/work-orders")]);
    setItems(a.data); setWos(b.data);
  };
  useEffect(() => { load(); }, []);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const addPhoto = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setForm(p => ({ ...p, photos: [...(p.photos || []), r.result] }));
    r.readAsDataURL(f);
  };

  const save = async () => {
    try {
      await api.post("/qc-reports", form);
      toast.success("QC report saved"); setOpen(false); setForm({ result: "pass", photos: [] }); load();
    } catch (e) { toast.error("Failed"); }
  };
  const del = async (r) => { if (!window.confirm("Delete?")) return; await api.delete(`/qc-reports/${r.id}`); load(); };

  return (
    <div data-testid="qc-page">
      <PageHeader
        overline="Quality" title="QC Reports"
        subtitle="Inspections linked to work orders and customers — searchable forever."
        actions={<Button onClick={()=>{setForm({result:"pass",photos:[],inspection_date:new Date().toISOString().slice(0,10)}); setOpen(true);}} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="new-qc"><Plus className="h-4 w-4 mr-1" /> New QC</Button>}
      />
      <Card>
        {items.length === 0 ? <Empty label="No QC reports yet." /> : (
          <table className="w-full">
            <thead><tr><Th>Code</Th><Th>WO</Th><Th>Inspector</Th><Th>Parameter</Th><Th>Spec</Th><Th>Measured</Th><Th>Result</Th><Th>Photos</Th><Th>Date</Th><Th></Th></tr></thead>
            <tbody>
              {items.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="font-mono-tech text-xs">{r.code}</Td>
                  <Td className="font-mono-tech text-xs">{r.work_order_code || "—"}</Td>
                  <Td>{r.inspector}</Td>
                  <Td>{r.parameter}</Td>
                  <Td className="text-slate-500">{r.spec}</Td>
                  <Td>{r.measured}</Td>
                  <Td><StatusBadge status={r.result} /></Td>
                  <Td>{r.photos?.length ? <span className="inline-flex items-center text-xs text-slate-600"><ImageIcon className="h-3 w-3 mr-1" />{r.photos.length}</span> : "—"}</Td>
                  <Td>{fmtDate(r.inspection_date)}</Td>
                  <Td className="text-right"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>del(r)}><Trash2 className="h-4 w-4 text-red-600" /></Button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl">
          <DialogHeader><DialogTitle className="font-display">New QC Report</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Work Order">
              <Select value={form.work_order_id || ""} onValueChange={v=>setF("work_order_id", v)}>
                <SelectTrigger className="rounded-sm" data-testid="qc-wo"><SelectValue placeholder="Select WO" /></SelectTrigger>
                <SelectContent>{wos.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.product}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Inspector"><Input value={form.inspector || ""} onChange={e=>setF("inspector", e.target.value)} /></Field>
            <Field label="Parameter *"><Input value={form.parameter || ""} onChange={e=>setF("parameter", e.target.value)} data-testid="qc-param" /></Field>
            <Field label="Spec"><Input value={form.spec || ""} onChange={e=>setF("spec", e.target.value)} placeholder="e.g. 25.00 ± 0.02 mm" /></Field>
            <Field label="Measured"><Input value={form.measured || ""} onChange={e=>setF("measured", e.target.value)} /></Field>
            <Field label="Result">
              <Select value={form.result || "pass"} onValueChange={v=>setF("result", v)}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="rework">Rework</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Inspection Date"><Input type="date" value={(form.inspection_date || "").slice(0,10)} onChange={e=>setF("inspection_date", e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Notes"><Textarea rows={2} value={form.notes || ""} onChange={e=>setF("notes", e.target.value)} /></Field></div>
            <div className="col-span-2">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Photos</Label>
              <input type="file" accept="image/*" onChange={addPhoto} className="block mt-1.5 text-sm" data-testid="qc-photo-input" />
              <div className="flex gap-2 mt-2 flex-wrap">
                {(form.photos || []).map((p, i) => (
                  <div key={i} className="relative h-20 w-20 border border-slate-200">
                    <img src={p} alt="" className="w-full h-full object-cover" />
                    <button className="absolute top-0 right-0 bg-white p-0.5" onClick={()=>setF("photos", form.photos.filter((_,j)=>j!==i))}><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-qc">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
