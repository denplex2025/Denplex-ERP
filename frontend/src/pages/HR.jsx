import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, Card, Th, Td, Empty, fmtDate, inr } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import { Plus, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

export default function HR() {
  const [tab, setTab] = useState("emp");
  const [emps, setEmps] = useState([]);
  const [atts, setAtts] = useState([]);
  const [empOpen, setEmpOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [empForm, setEmpForm] = useState({ department: "production", status: "active" });
  const [attOpen, setAttOpen] = useState(false);
  const [attForm, setAttForm] = useState({ status: "present", hours: 8, date: new Date().toISOString().slice(0,10) });

  const load = async () => {
    const [a, b] = await Promise.all([api.get("/employees"), api.get("/attendance")]);
    setEmps(a.data); setAtts(b.data);
  };
  useEffect(() => { load(); }, []);

  const saveEmp = async () => {
    try {
      if (editing) await api.put(`/employees/${editing.id}`, empForm);
      else await api.post("/employees", empForm);
      toast.success("Saved"); setEmpOpen(false); setEditing(null); setEmpForm({ department: "production", status: "active" }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const delEmp = async (r) => { if (!window.confirm("Delete?")) return; await api.delete(`/employees/${r.id}`); load(); };

  const saveAtt = async () => {
    try {
      await api.post("/attendance", { ...attForm, hours: Number(attForm.hours)||0 });
      toast.success("Marked"); setAttOpen(false); setAttForm({ status: "present", hours: 8, date: new Date().toISOString().slice(0,10) }); load();
    } catch (e) { toast.error("Failed"); }
  };
  const delAtt = async (r) => { if (!window.confirm("Delete?")) return; await api.delete(`/attendance/${r.id}`); load(); };

  return (
    <div data-testid="hr-page">
      <PageHeader overline="HR" title="Employees & Attendance" subtitle="Maintain your workforce roster and daily attendance. Can connect to external HR software via exports later." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100 mb-4">
          <TabsTrigger value="emp" className="rounded-sm" data-testid="tab-employees">Employees</TabsTrigger>
          <TabsTrigger value="att" className="rounded-sm" data-testid="tab-attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="emp">
          <div className="flex justify-end mb-3">
            <Button onClick={()=>{setEditing(null); setEmpForm({department:"production",status:"active"}); setEmpOpen(true);}} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="new-employee"><Plus className="h-4 w-4 mr-1" /> New Employee</Button>
          </div>
          <Card>
            {emps.length === 0 ? <Empty label="No employees yet." /> : (
              <table className="w-full">
                <thead><tr><Th>Code</Th><Th>Name</Th><Th>Designation</Th><Th>Dept</Th><Th>Phone</Th><Th>Salary</Th><Th>Status</Th><Th></Th></tr></thead>
                <tbody>
                  {emps.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <Td className="font-mono-tech text-xs">{e.code}</Td>
                      <Td>{e.name}</Td>
                      <Td>{e.designation}</Td>
                      <Td className="uppercase text-xs">{e.department}</Td>
                      <Td>{e.phone}</Td>
                      <Td className="font-mono-tech">{inr(e.monthly_salary)}</Td>
                      <Td><StatusBadge status={e.status === "active" ? "done" : "cancelled"} /></Td>
                      <Td className="text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>{setEditing(e); setEmpForm(e); setEmpOpen(true);}}><Edit className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>delEmp(e)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="att">
          <div className="flex justify-end mb-3">
            <Button onClick={()=>setAttOpen(true)} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="new-attendance"><Plus className="h-4 w-4 mr-1" /> Mark Attendance</Button>
          </div>
          <Card>
            {atts.length === 0 ? <Empty label="No attendance entries." /> : (
              <table className="w-full">
                <thead><tr><Th>Date</Th><Th>Employee</Th><Th>Status</Th><Th>Hours</Th><Th>Notes</Th><Th></Th></tr></thead>
                <tbody>
                  {atts.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <Td>{fmtDate(a.date)}</Td>
                      <Td>{a.employee_name}</Td>
                      <Td className="uppercase text-xs">{a.status.replace("_"," ")}</Td>
                      <Td className="font-mono-tech">{a.hours}</Td>
                      <Td>{a.notes}</Td>
                      <Td className="text-right"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>delAtt(a)}><Trash2 className="h-4 w-4 text-red-600" /></Button></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={empOpen} onOpenChange={setEmpOpen}>
        <DialogContent className="rounded-sm max-w-xl">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Edit" : "New"} Employee</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *"><Input value={empForm.name||""} onChange={e=>setEmpForm(p=>({...p,name:e.target.value}))} data-testid="emp-name" /></Field>
            <Field label="Designation"><Input value={empForm.designation||""} onChange={e=>setEmpForm(p=>({...p,designation:e.target.value}))} /></Field>
            <Field label="Department">
              <Select value={empForm.department||"production"} onValueChange={v=>setEmpForm(p=>({...p,department:v}))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{["production","qc","admin","sales","stores","accounts"].map(o=><SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={empForm.status||"active"} onValueChange={v=>setEmpForm(p=>({...p,status:v}))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Phone"><Input value={empForm.phone||""} onChange={e=>setEmpForm(p=>({...p,phone:e.target.value}))} /></Field>
            <Field label="Email"><Input value={empForm.email||""} onChange={e=>setEmpForm(p=>({...p,email:e.target.value}))} /></Field>
            <Field label="Join Date"><Input type="date" value={(empForm.join_date||"").slice(0,10)} onChange={e=>setEmpForm(p=>({...p,join_date:e.target.value}))} /></Field>
            <Field label="Monthly Salary"><Input type="number" value={empForm.monthly_salary||""} onChange={e=>setEmpForm(p=>({...p,monthly_salary:Number(e.target.value)}))} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setEmpOpen(false)}>Cancel</Button>
            <Button onClick={saveEmp} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-employee">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attOpen} onOpenChange={setAttOpen}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display">Mark Attendance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Employee">
              <Select value={attForm.employee_id||""} onValueChange={v=>setAttForm(p=>({...p,employee_id:v}))}>
                <SelectTrigger className="rounded-sm" data-testid="att-emp"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{emps.map(e=><SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date"><Input type="date" value={attForm.date} onChange={e=>setAttForm(p=>({...p,date:e.target.value}))} /></Field>
            <Field label="Status">
              <Select value={attForm.status} onValueChange={v=>setAttForm(p=>({...p,status:v}))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{["present","absent","half_day","leave"].map(o=><SelectItem key={o} value={o} className="capitalize">{o.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Hours"><Input type="number" value={attForm.hours} onChange={e=>setAttForm(p=>({...p,hours:e.target.value}))} /></Field>
            <Field label="Notes"><Input value={attForm.notes||""} onChange={e=>setAttForm(p=>({...p,notes:e.target.value}))} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setAttOpen(false)}>Cancel</Button>
            <Button onClick={saveAtt} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-attendance">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
