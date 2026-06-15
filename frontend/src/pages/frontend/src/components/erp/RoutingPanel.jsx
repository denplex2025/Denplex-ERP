import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Play, Check, Trash2, Wand2, Route, Clock,
} from "lucide-react";
import StatusBadge from "@/components/erp/StatusBadge";

const emptyOp = { operation: "", machine: "", operator: "", planned_minutes: "" };

/**
 * Phase 1 — MES routing panel for a single Work Order.
 * Operation -> Machine -> Operator -> Status -> Time, with start/complete tracking.
 * Renders as a dialog; controlled by parent via `wo` (truthy => open) + `onClose`.
 */
export default function RoutingPanel({ wo, onClose }) {
  const [ops, setOps]       = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm]     = useState(emptyOp);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const wid = wo ? (wo._id || wo.id) : null;

  const refresh = async () => {
    if (!wid) return;
    setLoading(true);
    try {
      const r = await api.get(`/work-orders/${wid}/operations`);
      setOps(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      setOps([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!wid) return;
    refresh();
    api.get("/machines", { silent: true })
      .then((r) => setMachines(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid]);

  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addOp = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.operation.trim()) { setError("Operation name is required."); return; }
    setSaving(true);
    try {
      await api.post(`/work-orders/${wid}/operations`, {
        operation: form.operation.trim(),
        machine: form.machine.trim(),
        operator: form.operator.trim(),
        planned_minutes: parseFloat(form.planned_minutes) || 0,
      });
      setForm(emptyOp);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to add operation");
    }
    setSaving(false);
  };

  const seedFromPart = async () => {
    setError("");
    try {
      const r = await api.post(`/work-orders/${wid}/operations/seed-from-part`);
      if (r.data?.count === 0) setError("No process steps found on the part.");
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not seed from Part Master");
    }
  };

  const start = async (op) => {
    try { await api.post(`/work-orders/${wid}/operations/${op.id}/start`); refresh(); }
    catch (err) { setError(err?.response?.data?.detail || "Failed to start"); }
  };

  const complete = async (op) => {
    try { await api.post(`/work-orders/${wid}/operations/${op.id}/complete`); refresh(); }
    catch (err) { setError(err?.response?.data?.detail || "Failed to complete"); }
  };

  const hold = async (op) => {
    try {
      await api.put(`/work-orders/${wid}/operations/${op.id}`, { ...op, status: "hold" });
      refresh();
    } catch (err) { setError(err?.response?.data?.detail || "Failed to update"); }
  };

  const del = async (op) => {
    if (!window.confirm(`Delete operation "${op.operation}"?`)) return;
    try { await api.delete(`/work-orders/${wid}/operations/${op.id}`); refresh(); }
    catch (err) { setError(err?.response?.data?.detail || "Delete failed"); }
  };

  const fmtMin = (m) => (m ? `${m}m` : "—");
  const plannedTotal = ops.reduce((s, o) => s + (Number(o.planned_minutes) || 0), 0);
  const actualTotal  = ops.reduce((s, o) => s + (Number(o.actual_minutes) || 0), 0);

  return (
    <Dialog open={!!wo} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="w-5 h-5 text-red-600" />
            Routing — {wo?.wo_no || wo?.code || "Work Order"}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-slate-500 -mt-2 mb-1">
          {wo?.product || wo?.part_name || "—"}
          {wo?.part_number ? ` · ${wo.part_number}` : ""} · Qty {wo?.qty || wo?.quantity || 0}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Planned {fmtMin(plannedTotal)} · Actual {fmtMin(actualTotal)}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={seedFromPart}
            className="text-xs" title="Generate operations from Part Master process list">
            <Wand2 className="w-3.5 h-3.5 mr-1" /> Seed from Part
          </Button>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">Operation</th>
                <th className="text-left px-3 py-2">Machine</th>
                <th className="text-left px-3 py-2">Operator</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Time</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-6 text-slate-400 text-xs">Loading…</td></tr>
              ) : ops.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-slate-400 text-xs">
                  No operations yet. Add one below or seed from the Part Master.
                </td></tr>
              ) : ops.map((op) => (
                <tr key={op.id} className="border-b hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-400">{op.seq}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{op.operation}</td>
                  <td className="px-3 py-2">{op.machine || "—"}</td>
                  <td className="px-3 py-2">{op.operator || "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={op.status} /></td>
                  <td className="px-3 py-2 text-right text-xs text-slate-500">
                    {op.status === "done"
                      ? fmtMin(op.actual_minutes)
                      : op.planned_minutes ? `~${fmtMin(op.planned_minutes)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {op.status !== "done" && op.status !== "running" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Start"
                        onClick={() => start(op)}>
                        <Play className="h-3.5 w-3.5 text-blue-600" />
                      </Button>
                    )}
                    {op.status === "running" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Complete"
                        onClick={() => complete(op)}>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                    )}
                    {op.status === "running" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Hold"
                        onClick={() => hold(op)}>
                        <span className="text-[10px] font-bold text-amber-600">||</span>
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Delete"
                      onClick={() => del(op)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={addOp} className="grid grid-cols-12 gap-2 items-end pt-1">
          <div className="col-span-4">
            <label className="text-[11px] uppercase tracking-wider text-slate-500">Operation *</label>
            <Input value={form.operation} onChange={(e) => change("operation", e.target.value)}
              placeholder="e.g. CNC Turning" />
          </div>
          <div className="col-span-3">
            <label className="text-[11px] uppercase tracking-wider text-slate-500">Machine</label>
            <Input list="rp-machine-list" value={form.machine}
              onChange={(e) => change("machine", e.target.value)} placeholder="LMW / VMC-1" />
            <datalist id="rp-machine-list">
              {machines.map((m, i) => (
                <option key={i} value={m.name || m.code} />
              ))}
            </datalist>
          </div>
          <div className="col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-slate-500">Operator</label>
            <Input value={form.operator} onChange={(e) => change("operator", e.target.value)}
              placeholder="Ravi" />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-slate-500">Plan (min)</label>
            <Input type="number" min="0" value={form.planned_minutes}
              onChange={(e) => change("planned_minutes", e.target.value)} placeholder="15" />
          </div>
          <div className="col-span-1">
            <Button type="submit" disabled={saving} size="icon"
              className="bg-red-600 hover:bg-red-700 text-white h-10 w-full" title="Add operation">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
