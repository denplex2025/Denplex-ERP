import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const ROLES = ["admin","manager","production","qc","accountant","ca","sales","employee"];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ role: "employee" });

  const load = async () => { try { const r = await api.get("/users"); setUsers(r.data); } catch (e) { toast.error("Only admins can manage users"); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/auth/register", form);
      toast.success("User created"); setOpen(false); setForm({ role: "employee" }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div data-testid="users-page">
      <PageHeader overline="Administration" title="Users & Permissions" subtitle="Create accounts for staff, managers, accountants, and your CA."
        actions={<Button onClick={()=>setOpen(true)} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="new-user"><Plus className="h-4 w-4 mr-1" /> New User</Button>} />
      <Card>
        {users.length === 0 ? <Empty label="No users." /> : (
          <table className="w-full">
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Created</Th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}><Td>{u.name}</Td><Td>{u.email}</Td><Td className="uppercase text-xs font-semibold">{u.role}</Td><Td>{fmtDate(u.created_at)}</Td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display">New User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name *"><Input value={form.name || ""} onChange={e=>setForm(p=>({...p,name:e.target.value}))} data-testid="user-name" /></Field>
            <Field label="Email *"><Input type="email" value={form.email || ""} onChange={e=>setForm(p=>({...p,email:e.target.value}))} data-testid="user-email" /></Field>
            <Field label="Password *"><Input type="password" value={form.password || ""} onChange={e=>setForm(p=>({...p,password:e.target.value}))} data-testid="user-password" /></Field>
            <Field label="Role">
              <Select value={form.role} onValueChange={v=>setForm(p=>({...p,role:v}))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="uppercase">{r}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-user">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
