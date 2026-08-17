import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";

const ROLES = ["admin","manager","production","qc","accountant","ca","sales","design","employee"];
const UNITS = ["Unit 1","Unit 2","Unit 3","Unit 4"];

// Shared module keys — used by BOTH the mobile menu (MobileMenu.jsx GROUPS) and the desktop
// sidebar (AppLayout.jsx NAV_GROUPS) so one toggle here controls a user's access on either surface.
// A per-user override layers on top of the role-based default: unset = fall back to role,
// true = force-show even if the role wouldn't normally get it, false = force-hide even if it would.
// Desktop has finer-grained nav heads than mobile's grouping — "accounts" covers what desktop's
// Accounts head bundles (GST/Financials/Bank & Cash/Statements) and mobile's Cash & Bank + Reports
// groups both map to it, since mobile shows those as two screens for the same one desktop section.
const MODULES = [
  { key: "sales", label: "Sales (quotes, sale orders, invoices)" },
  { key: "accounts", label: "Accounts (GST, financial statements, cash & bank, reports)" },
  { key: "production", label: "Production / Manufacturing" },
  { key: "procurement", label: "Procurement (desktop only)" },
  { key: "quality", label: "Quality" },
  { key: "marketing", label: "Marketing (desktop only)" },
  { key: "hr", label: "HR (desktop only)" },
  { key: "administration", label: "Administration" },
];

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ role: "employee", unit: "Unit 1" });

  const [editing, setEditing] = useState(null); // the user row being edited, or null
  const [editForm, setEditForm] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => { try { const r = await api.get("/users"); setUsers(r.data); } catch (e) { toast.error("Only admins can manage users"); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/auth/register", form);
      toast.success("User created"); setOpen(false); setForm({ role: "employee", unit: "Unit 1" }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const openEdit = (u) => {
    setEditing(u);
    setEditForm({ name: u.name, email: u.email, role: u.role, unit: u.unit || "Unit 1", module_access: { ...(u.module_access || {}) } });
    setNewPassword("");
  };

  const cycleModule = (key) => {
    setEditForm((f) => {
      const cur = f.module_access[key]; // undefined -> true -> false -> undefined
      const next = { ...f.module_access };
      if (cur === undefined) next[key] = true;
      else if (cur === true) next[key] = false;
      else delete next[key];
      return { ...f, module_access: next };
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/users/${editing.id}`, editForm);
      if (newPassword) {
        if (newPassword.length < 8) { toast.error("New password must be at least 8 characters"); setSaving(false); return; }
        await api.put(`/users/${editing.id}/password`, { new_password: newPassword });
      }
      toast.success("User updated"); setEditing(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
    finally { setSaving(false); }
  };

  const del = async (u) => {
    if (u.id === me?.id) { toast.error("You cannot delete your own account"); return; }
    if (!window.confirm(`Delete ${u.name} (${u.email})? This cannot be undone.`)) return;
    try { await api.delete(`/users/${u.id}`); toast.success("User deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  return (
    <div data-testid="users-page">
      <PageHeader overline="Administration" title="Users & Permissions" subtitle="Create accounts for staff, managers, accountants, and your CA."
        actions={<Button onClick={()=>setOpen(true)} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="new-user"><Plus className="h-4 w-4 mr-1" /> New User</Button>} />
      <Card>
        {users.length === 0 ? <Empty label="No users." /> : (
          <table className="w-full">
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Unit</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <Td>{u.name}</Td><Td>{u.email}</Td>
                  <Td className="uppercase text-xs font-semibold">{u.role}</Td>
                  <Td className="text-xs">{u.unit || "Unit 1"}</Td>
                  <Td>{fmtDate(u.created_at)}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} title="Edit" className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-500 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => del(u)} title="Delete" disabled={u.id === me?.id}
                        className={`p-1.5 rounded-sm ${u.id === me?.id ? "text-slate-300 cursor-not-allowed" : "hover:bg-red-50 text-slate-500 hover:text-red-600"}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create */}
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
            <Field label="Unit">
              <Select value={form.unit || "Unit 1"} onValueChange={v=>setForm(p=>({...p,unit:v}))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-user">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit — role/unit/email/name, per-module access toggles, optional password reset */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display">Edit {editing?.name}</DialogTitle></DialogHeader>
          {editForm && (
            <div className="space-y-3">
              <Field label="Name"><Input value={editForm.name || ""} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} /></Field>
              <Field label="Email"><Input type="email" value={editForm.email || ""} onChange={e=>setEditForm(p=>({...p,email:e.target.value}))} /></Field>
              <Field label="Role">
                <Select value={editForm.role} onValueChange={v=>setEditForm(p=>({...p,role:v}))}>
                  <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="uppercase">{r}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Unit">
                <Select value={editForm.unit} onValueChange={v=>setEditForm(p=>({...p,unit:v}))}>
                  <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </Field>

              <Field label="Module Access (overrides the role default — tap to cycle)">
                <div className="space-y-1.5">
                  {MODULES.map((m) => {
                    const v = editForm.module_access[m.key];
                    const state = v === true ? "ON" : v === false ? "OFF" : "DEFAULT";
                    const style = state === "ON" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : state === "OFF" ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-slate-50 text-slate-500 border-slate-200";
                    return (
                      <button key={m.key} type="button" onClick={() => cycleModule(m.key)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-sm border text-xs font-medium ${style}`}>
                        <span>{m.label}</span>
                        <span className="uppercase tracking-wider">{state}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Default = follows their role's normal access · On = force allow · Off = force block</div>
              </Field>

              <Field label="Reset Password (leave blank to keep current)">
                <Input type="password" placeholder="New password (min 8 characters)" value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700">
              {saving ? "Saving…" : (<><KeyRound className="h-4 w-4 mr-1" />Save Changes</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
