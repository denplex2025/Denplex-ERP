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
const AXES_OPTIONS = [3, 4, 5];
const CONTROLLER_TYPES = ["Fanuc", "Siemens", "Haas", "Mach3", "LinuxCNC", "GRBL", "Heidenhain", "Mitsubishi", "Other"];

const emptyForm = {
  name: "", machine_type: "", group: "", status: "available",
  hourly_rate: "", location: "", notes: "",
  axes: "3", controller_type: "", travel_x_mm: "", travel_y_mm: "", travel_z_mm: "",
  turning_dia_mm: "", turning_length_mm: "", rotary_axis: "", spindle_max_rpm: "", rapid_feed_mm_min: "10000",
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
      axes: String(m.axes || 3), controller_type: m.controller_type || "",
      travel_x_mm: m.travel_x_mm || "", travel_y_mm: m.travel_y_mm || "", travel_z_mm: m.travel_z_mm || "",
      turning_dia_mm: m.turning_dia_mm || "", turning_length_mm: m.turning_length_mm || "",
      rotary_axis: m.rotary_axis || "", spindle_max_rpm: m.spindle_max_rpm || "",
      rapid_feed_mm_min: m.rapid_feed_mm_min || "10000",
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
        axes: parseInt(form.axes) || 3,
        controller_type: form.controller_type.trim(),
        travel_x_mm: parseFloat(form.travel_x_mm) || 0,
        travel_y_mm: parseFloat(form.travel_y_mm) || 0,
        travel_z_mm: parseFloat(form.travel_z_mm) || 0,
        turning_dia_mm: parseFloat(form.turning_dia_mm) || 0,
        turning_length_mm: parseFloat(form.turning_length_mm) || 0,
        rotary_axis: form.rotary_axis.trim(),
        spindle_max_rpm: parseFloat(form.spindle_max_rpm) || 0,
        rapid_feed_mm_min: parseFloat(form.rapid_feed_mm_min) || 10000,
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
                    <th className="text-left px-4 py-2">Axes</th>
                    <th className="text-left px-4 py-2">Controller</th>
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
                      <td className="px-4 py-2">{m.axes ? `${m.axes}-axis` : "—"}</td>
                      <td className="px-4 py-2">{m.controller_type || "—"}</td>
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

              <div className="col-span-2 pt-2 mt-1 border-t text-xs font-semibold uppercase tracking-wider text-slate-500">
                Machining specs (for STEP quoting)
              </div>
              <div>
                <Label htmlFor="m-axes">Axes</Label>
                <select id="m-axes" value={form.axes} onChange={(e) => change("axes", e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                  {AXES_OPTIONS.map((a) => (<option key={a} value={a}>{a}-axis{a > 3 ? " (indexed)" : ""}</option>))}
                </select>
              </div>
              <div>
                <Label htmlFor="m-controller">Controller Type</Label>
                <select id="m-controller" value={form.controller_type} onChange={(e) => change("controller_type", e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                  <option value="">—</option>
                  {CONTROLLER_TYPES.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <Label htmlFor="m-tx">Travel X (mm)</Label>
                <Input id="m-tx" type="number" min="0" value={form.travel_x_mm}
                  onChange={(e) => change("travel_x_mm", e.target.value)} placeholder="mill work envelope" />
              </div>
              <div>
                <Label htmlFor="m-ty">Travel Y (mm)</Label>
                <Input id="m-ty" type="number" min="0" value={form.travel_y_mm}
                  onChange={(e) => change("travel_y_mm", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="m-tz">Travel Z (mm)</Label>
                <Input id="m-tz" type="number" min="0" value={form.travel_z_mm}
                  onChange={(e) => change("travel_z_mm", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="m-rpm">Spindle Max RPM</Label>
                <Input id="m-rpm" type="number" min="0" value={form.spindle_max_rpm}
                  onChange={(e) => change("spindle_max_rpm", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="m-tdia">Turning Dia (mm)</Label>
                <Input id="m-tdia" type="number" min="0" value={form.turning_dia_mm}
                  onChange={(e) => change("turning_dia_mm", e.target.value)} placeholder="lathe swing (0 if mill)" />
              </div>
              <div>
                <Label htmlFor="m-tlen">Turning Length (mm)</Label>
                <Input id="m-tlen" type="number" min="0" value={form.turning_length_mm}
                  onChange={(e) => change("turning_length_mm", e.target.value)} placeholder="between centers" />
              </div>
              <div>
                <Label htmlFor="m-rapid">Rapid Feed (mm/min)</Label>
                <Input id="m-rapid" type="number" min="0" value={form.rapid_feed_mm_min}
                  onChange={(e) => change("rapid_feed_mm_min", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="m-rotary">Rotary / Indexed Axis Details</Label>
                <Input id="m-rotary" value={form.rotary_axis} onChange={(e) => change("rotary_axis", e.target.value)}
                  placeholder="e.g. A-axis trunnion table, 300mm dia, ±110°  (leave blank if none)" />
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
