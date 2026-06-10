import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Cog, Pencil, Trash2 } from "lucide-react";
import StatusBadge from "@/components/erp/StatusBadge";

const STATUSES = ["available", "running", "maintenance", "idle"];

const emptyForm = {
  name: "", machine_type: "", group: "", status: "available",
  hourly_rate: "", location: "", notes: "",
};

export default function Machines() {
  const [list, setList]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]     = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get("/machines");
      setList(Array.isArray(r.data) ? r.data : []);
    } catch (e) { setList([]); }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => { setEditingId(null); setForm(emptyForm); setError(""); setOpen(true); };
  const openEdit = (m) => {
    setEditingId(m._id || m.id);
    setForm({
      name: m.name || "", machine_type: m.machine_type || "", group: m.group || "",
      status: m.status || "available", hourly_rate: m.hourly_rate ?? "",
      location: m.location || "", notes: m.notes || "",
    });
    setError(""); setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) { setError("Machine name is required."); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        machine_type: form.machine_type.trim(),
        group: form.group.trim(),
        status: form.status,
        hourly_rate: parseFloat(form.hourly_rate) || 0,
        location: form.location.trim(),
        notes: form.notes.trim(),
      };
      if (editingId) await api.put(`/machines/${editingId}`, payload);
      else await api.post("/machines", payload);
      setOpen(false); setEditingId(null); setForm(emptyForm); refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save machine");
    }
    setSaving(false);
  };

  const del = async (m) => {
    if (!window.confirm(`Delete machine ${m.name}?`)) return;
    try { await api.delete(`/machines/${m._id || m.id}`); refresh(); }
    catch (err) { alert(err?.response?.data?.detail || "Delete failed"); }
  };

  return (
    <div className="space-y-4 p-2 md:p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-red-600 font-semibold">Production</div>
          <h1 className="text-2xl font-bold">Machines</h1>
          <p className="text-sm text-slate-500">
            Your work-centre list. Used by Work Order routing and (later) capacity planning & machine-hour costing.
          </p>
        </div>
        <Button onClick={openNew} className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Loading…</div>
          ) : list.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No machines yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">Code</th>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Type</th>
                    <th className="text-left px-4 py-2">Group</th>
                    <th className="text-right px-4 py-2">₹/hr</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((m, i) => (
                    <tr key={m._id || m.id || i} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium">{m.code || "—"}</td>
                      <td className="px-4 py-2">{m.name}</td>
                      <td className="px-4 py-2">{m.machine_type || "—"}</td>
                      <td className="px-4 py-2">{m.group || "—"}</td>
                      <td className="px-4 py-2 text-right">{m.hourly_rate ? m.hourly_rate : "—"}</td>
                      <td className="px-4 py-2"><StatusBadge status={m.status || "available"} /></td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(m)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(m)} title="Delete">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cog className="w-5 h-5 text-red-600" />
              {editingId ? "Edit Machine" : "New Machine"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{error}</div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="m-name">Machine Name *</Label>
                <Input id="m-name" value={form.name} onChange={(e) => change("name", e.target.value)}
                  placeholder="e.g. LMW CNC Lathe" required />
              </div>
              <div>
                <Label htmlFor="m-type">Type</Label>
                <Input id="m-type" value={form.machine_type} onChange={(e) => change("machine_type", e.target.value)}
                  placeholder="CNC Turning / VMC / Grinder" />
              </div>
              <div>
                <Label htmlFor="m-group">Work-centre Group</Label>
                <Input id="m-group" value={form.group} onChange={(e) => change("group", e.target.value)}
                  placeholder="Turning / Milling" />
              </div>
              <div>
                <Label htmlFor="m-rate">Machine ₹/hr</Label>
                <Input id="m-rate" type="number" min="0" value={form.hourly_rate}
                  onChange={(e) => change("hourly_rate", e.target.value)} placeholder="450" />
              </div>
              <div>
                <Label htmlFor="m-status">Status</Label>
                <select id="m-status" value={form.status} onChange={(e) => change("status", e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                  {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="m-loc">Location</Label>
                <Input id="m-loc" value={form.location} onChange={(e) => change("location", e.target.value)}
                  placeholder="Shop floor bay / shed" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="m-notes">Notes</Label>
                <Textarea id="m-notes" rows={2} value={form.notes}
                  onChange={(e) => change("notes", e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
                {saving ? "Saving…" : (editingId ? "Update Machine" : "Create Machine")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
