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
import { Plus, Factory, Pencil, Trash2 } from "lucide-react";
import StatusBadge from "@/components/erp/StatusBadge";

const STATUSES   = ["planned", "in_progress", "qc", "completed", "on_hold", "cancelled"];
const PRIORITIES = ["low", "medium", "high"];

const emptyForm = {
  customer_name: "",
  part_name: "",
  part_number: "",
  qty: 1,
  due_date: "",
  priority: "medium",
  status: "planned",
  notes: "",
};

export default function WorkOrders() {
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [customers, setCustomers] = useState([]);
  const [parts, setParts]         = useState([]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get("/work-orders");
      setList(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.warn("WO list fetch failed:", e?.message);
      setList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    api.get("/customers", { silent: true })
      .then((r) => setCustomers(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    api.get("/parts", { silent: true })
      .then((r) => setParts(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);

  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  };

  const openEdit = (wo) => {
    setEditingId(wo._id || wo.id);
    setForm({
      customer_name: wo.customer_name || wo.customer || "",
      part_name: wo.product || wo.part_name || wo.item_name || "",
      part_number: wo.part_number || "",
      qty: wo.qty || wo.quantity || 1,
      due_date: wo.due_date || "",
      priority: wo.priority || "medium",
      status: wo.status || "planned",
      notes: wo.notes || "",
    });
    setError("");
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim()) { setError("Customer name is required."); return; }
    if (!form.part_name.trim())     { setError("Part name is required.");     return; }
    if (!form.qty || form.qty < 1)  { setError("Quantity must be at least 1."); return; }

    setSaving(true);
    try {
      const payload = {
        product: form.part_name.trim(),
        customer_name: form.customer_name.trim(),
        customer: form.customer_name.trim(),
        part_name: form.part_name.trim(),
        part_number: form.part_number.trim(),
        item_name: form.part_name.trim(),
        qty: parseInt(form.qty, 10) || 1,
        quantity: parseInt(form.qty, 10) || 1,
        due_date: form.due_date || null,
        priority: form.priority,
        status: form.status,
        notes: form.notes.trim(),
      };
      if (editingId) {
        await api.put(`/work-orders/${editingId}`, payload);
      } else {
        await api.post("/work-orders", payload);
      }
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      refresh();
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        "Failed to save work order";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    setSaving(false);
  };

  const del = async (wo) => {
    if (!window.confirm(`Delete work order ${wo.wo_no || wo.code || wo.id}?`)) return;
    try {
      await api.delete(`/work-orders/${wo._id || wo.id}`);
      refresh();
    } catch (e) {
      alert(e?.response?.data?.detail || "Delete failed");
    }
  };

  const safeCustomers = customers.filter((c) => c && (c.name || c.customer_name));
  const safeParts     = parts.filter((p) => p && (p.name || p.part_name || p.part_number));

  return (
    <div className="space-y-4 p-2 md:p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-red-600 font-semibold">Production</div>
          <h1 className="text-2xl font-bold">Work Orders</h1>
          <p className="text-sm text-slate-500">
            Plan and track production runs. Each WO can have multiple job cards & QC reports.
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
            <div className="text-center py-12 text-slate-400 text-sm">No records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">WO #</th>
                    <th className="text-left px-4 py-2">Customer</th>
                    <th className="text-left px-4 py-2">Part</th>
                    <th className="text-right px-4 py-2">Qty</th>
                    <th className="text-left px-4 py-2">Due</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((wo, i) => (
                    <tr key={wo._id || wo.id || i} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium">{wo.wo_no || wo.code || wo.number || "—"}</td>
                      <td className="px-4 py-2">{wo.customer_name || wo.customer || "—"}</td>
                      <td className="px-4 py-2">
                        <div className="text-slate-700">{wo.product || wo.part_name || wo.item_name || "—"}</div>
                        {wo.part_number && <div className="text-xs text-slate-400">{wo.part_number}</div>}
                      </td>
                      <td className="px-4 py-2 text-right">{wo.qty || wo.quantity || 0}</td>
                      <td className="px-4 py-2">{wo.due_date || "—"}</td>
                      <td className="px-4 py-2"><StatusBadge status={wo.status || "planned"} /></td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(wo)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(wo)} title="Delete">
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
              <Factory className="w-5 h-5 text-blue-600" />
              {editingId ? "Edit Work Order" : "New Work Order"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="customer">Customer Name *</Label>
                <Input
                  id="customer"
                  list="wo-customer-list"
                  value={form.customer_name}
                  onChange={(e) => change("customer_name", e.target.value)}
                  placeholder="Type or pick from existing"
                  autoComplete="off"
                  required
                />
                <datalist id="wo-customer-list">
                  {safeCustomers.map((c, i) => (
                    <option key={i} value={c.name || c.customer_name} />
                  ))}
                </datalist>
              </div>

              <div>
                <Label htmlFor="part_name">Part Name *</Label>
                <Input
                  id="part_name"
                  list="wo-part-list"
                  value={form.part_name}
                  onChange={(e) => change("part_name", e.target.value)}
                  placeholder="e.g. Shaft assembly"
                  autoComplete="off"
                  required
                />
                <datalist id="wo-part-list">
                  {safeParts.map((p, i) => (
                    <option key={i} value={p.name || p.part_name} />
                  ))}
                </datalist>
              </div>

              <div>
                <Label htmlFor="part_number">Part Number</Label>
                <Input
                  id="part_number"
                  value={form.part_number}
                  onChange={(e) => change("part_number", e.target.value)}
                  placeholder="e.g. DEN-001"
                />
              </div>

              <div>
                <Label htmlFor="qty">Quantity *</Label>
                <Input
                  id="qty"
                  type="number"
                  min="1"
                  value={form.qty}
                  onChange={(e) => change("qty", e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => change("due_date", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  value={form.priority}
                  onChange={(e) => change("priority", e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => change("status", e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => change("notes", e.target.value)}
                  placeholder="Special instructions, customer PO, etc."
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {saving ? "Saving…" : (editingId ? "Update Work Order" : "Create Work Order")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
