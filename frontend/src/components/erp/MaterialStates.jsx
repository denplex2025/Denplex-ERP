import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Power, ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const COLOR_OPTIONS = ["slate", "blue", "amber", "emerald", "red", "purple", "cyan", "rose", "indigo"];

const COLOR_CLASSES = {
  slate:   "bg-slate-50 text-slate-700 border-slate-300",
  blue:    "bg-blue-50 text-blue-700 border-blue-400",
  amber:   "bg-amber-50 text-amber-700 border-amber-400",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-400",
  red:     "bg-red-50 text-red-700 border-red-400",
  purple:  "bg-purple-50 text-purple-700 border-purple-400",
  cyan:    "bg-cyan-50 text-cyan-700 border-cyan-400",
  rose:    "bg-rose-50 text-rose-700 border-rose-400",
  indigo:  "bg-indigo-50 text-indigo-700 border-indigo-400",
};

const REF_TYPES = ["Manual", "GRN", "WO", "JobCard", "QC", "DC", "JWO"];

export default function MaterialStates() {
  const [tab, setTab] = useState("stock");
  const [states, setStates] = useState([]);
  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [move, setMove] = useState({});
  const [moveSaving, setMoveSaving] = useState(false);

  const [stateOpen, setStateOpen] = useState(false);
  const [stateForm, setStateForm] = useState({ name: "", description: "", color: "slate", sort_order: 100, is_active: true });
  const [stateEditing, setStateEditing] = useState(null);
  const [stateSaving, setStateSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, b, m, i] = await Promise.all([
        api.get("/material-states", { silent: true }),
        api.get("/material-states/balance", { silent: true }),
        api.get("/material-states/movements", { silent: true }),
        api.get("/inventory/items", { silent: true }).catch(() => ({ data: [] })),
      ]);
      setStates(Array.isArray(s.data) ? s.data : []);
      setBalances(Array.isArray(b.data) ? b.data : []);
      setMovements(Array.isArray(m.data) ? m.data : []);
      setItems(Array.isArray(i.data) ? i.data : []);
    } catch (e) {
      console.warn("Material states load failed:", e?.message);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const activeStates = useMemo(() => states.filter((s) => s.is_active), [states]);
  const getStateMeta = (key) => states.find((s) => s.key === key) || { name: key || "—", color: "slate" };

  const summary = useMemo(() => {
    const out = {};
    balances.forEach((b) => { out[b.state] = (out[b.state] || 0) + b.qty; });
    return out;
  }, [balances]);

  const filteredBalances = useMemo(() => {
    if (!filterState) return balances;
    return balances.filter((b) => b.state === filterState);
  }, [balances, filterState]);

  const openMoveDialog = (preset = {}) => {
    setMove({
      qty: 0, from_state: "", to_state: activeStates[0]?.key || "",
      item_sku: "", item_name: "", note: "",
      ref_type: "Manual", ref_code: "", location: "", lot_no: "",
      ...preset,
    });
    setMoveOpen(true);
  };

  const saveMove = async () => {
    if (!move.item_name?.trim()) { toast.error("Item required"); return; }
    if (!move.qty || Number(move.qty) <= 0) { toast.error("Qty must be > 0"); return; }
    if (!move.from_state && !move.to_state) { toast.error("Pick From or To state (or both)"); return; }
    if (move.from_state && move.from_state === move.to_state) { toast.error("From and To must differ"); return; }
    const existing = items.find((i) => i.name === move.item_name || i.sku === move.item_name);
    const payload = {
      item_id: existing?.id || "",
      item_sku: existing?.sku || move.item_sku || "",
      item_name: move.item_name.trim(),
      qty: Number(move.qty),
      from_state: move.from_state || "",
      to_state: move.to_state || "",
      ref_type: move.ref_type || "Manual",
      ref_code: move.ref_code || "",
      location: move.location || "",
      lot_no: move.lot_no || "",
      note: move.note || "",
    };
    setMoveSaving(true);
    try {
      await api.post("/material-states/move", payload);
      toast.success("Movement recorded");
      setMoveOpen(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to record movement");
    }
    setMoveSaving(false);
  };

  const openNewState = () => {
    setStateEditing(null);
    setStateForm({ name: "", description: "", color: "slate", sort_order: 100, is_active: true });
    setStateOpen(true);
  };
  const openEditState = (s) => {
    setStateEditing(s);
    setStateForm({ ...s });
    setStateOpen(true);
  };
  const saveState = async () => {
    if (!stateForm.name?.trim()) { toast.error("Name required"); return; }
    setStateSaving(true);
    try {
      if (stateEditing) {
        await api.put(`/material-states/${stateEditing.id}`, stateForm);
        toast.success("State updated");
      } else {
        await api.post("/material-states", stateForm);
        toast.success("State created");
      }
      setStateOpen(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
    setStateSaving(false);
  };
  const toggleActive = async (s) => {
    try {
      await api.put(`/material-states/${s.id}`, { ...s, is_active: !s.is_active });
      toast.success(s.is_active ? "Deactivated" : "Activated");
      load();
    } catch (e) {
      toast.error("Failed");
    }
  };
  const deleteState = async (s) => {
    if (s.is_system) { toast.error("System state — deactivate instead"); return; }
    if (!window.confirm(`Delete state "${s.name}"?`)) return;
    try {
      await api.delete(`/material-states/${s.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading material states…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
        {activeStates.map((s) => {
          const qty = summary[s.key] || 0;
          const cls = COLOR_CLASSES[s.color] || COLOR_CLASSES.slate;
          const active = filterState === s.key;
          return (
            <button
              key={s.id}
              onClick={() => setFilterState(active ? "" : s.key)}
              className={`border rounded-sm p-2 text-left transition-shadow hover:shadow ${cls} ${active ? "ring-2 ring-offset-1 ring-current" : ""}`}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-70 truncate">{s.name}</div>
              <div className="text-xl font-bold leading-tight">{qty.toLocaleString()}</div>
            </button>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100">
          <TabsTrigger value="stock" className="rounded-sm">Stock View</TabsTrigger>
          <TabsTrigger value="movements" className="rounded-sm">Movements</TabsTrigger>
          <TabsTrigger value="manage" className="rounded-sm">Manage States</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm">
                  {filterState ? `Stock — ${getStateMeta(filterState).name}` : "Stock — All states"}
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  {filterState ? "Click chip again to clear filter" : "Click a state chip above to filter"}
                </p>
              </div>
              <Button onClick={() => openMoveDialog()} size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                <ArrowRightLeft className="w-4 h-4 mr-1" /> Record Movement
              </Button>
            </CardHeader>
            <CardContent>
              {filteredBalances.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No balances yet. Click "Record Movement" to start.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wider text-slate-500">
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-left px-3 py-2">SKU</th>
                        <th className="text-left px-3 py-2">State</th>
                        <th className="text-right px-3 py-2">Qty</th>
                        <th className="text-right px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBalances.map((b, i) => {
                        const meta = getStateMeta(b.state);
                        const cls = COLOR_CLASSES[meta.color] || COLOR_CLASSES.slate;
                        return (
                          <tr key={i} className="border-b hover:bg-slate-50">
                            <td className="px-3 py-2">{b.item_name || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-500">{b.item_sku || "—"}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-sm border ${cls}`}>
                                {meta.name}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{Number(b.qty).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">
                              <Button size="sm" variant="outline" onClick={() => openMoveDialog({
                                item_name: b.item_name,
                                item_sku: b.item_sku,
                                from_state: b.state,
                                to_state: "",
                                qty: 0,
                              })}>
                                Move
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm">Movement Log</CardTitle>
              <Button onClick={() => openMoveDialog()} size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                <ArrowRightLeft className="w-4 h-4 mr-1" /> Record Movement
              </Button>
            </CardHeader>
            <CardContent>
              {movements.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No movements recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wider text-slate-500">
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-left px-3 py-2">From → To</th>
                        <th className="text-right px-3 py-2">Qty</th>
                        <th className="text-left px-3 py-2">Ref</th>
                        <th className="text-left px-3 py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => {
                        const fromMeta = m.from_state ? getStateMeta(m.from_state) : null;
                        const toMeta = m.to_state ? getStateMeta(m.to_state) : null;
                        return (
                          <tr key={m.id} className="border-b hover:bg-slate-50">
                            <td className="px-3 py-2 text-xs">{(m.created_at || "").slice(0, 10)}</td>
                            <td className="px-3 py-2">{m.item_name || "—"}</td>
                            <td className="px-3 py-2 text-xs">
                              <span className="text-slate-500">{fromMeta?.name || "—"}</span>
                              <span className="mx-1 text-slate-400">→</span>
                              <span className="font-medium">{toMeta?.name || "—"}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{Number(m.qty).toLocaleString()}</td>
                            <td className="px-3 py-2 text-xs">{m.ref_type}{m.ref_code ? ` · ${m.ref_code}` : ""}</td>
                            <td className="px-3 py-2 text-xs text-slate-500">{m.note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm">Manage Material States</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Rename, recolor, deactivate, or add custom states.</p>
              </div>
              <Button onClick={openNewState} size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                <Plus className="w-4 h-4 mr-1" /> Add State
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wider text-slate-500">
                      <th className="text-left px-3 py-2">Sort</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Key</th>
                      <th className="text-left px-3 py-2">Color</th>
                      <th className="text-left px-3 py-2">Active</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-right px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map((s) => {
                      const cls = COLOR_CLASSES[s.color] || COLOR_CLASSES.slate;
                      return (
                        <tr key={s.id} className="border-b hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs">{s.sort_order}</td>
                          <td className="px-3 py-2 font-medium">{s.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">{s.key}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-sm border ${cls}`}>
                              {s.color}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {s.is_active ? (
                              <span className="text-emerald-600">● Active</span>
                            ) : (
                              <span className="text-slate-400">○ Inactive</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {s.is_system ? (
                              <span className="text-slate-500">System</span>
                            ) : (
                              <span className="text-blue-600">Custom</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditState(s)} title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleActive(s)} title={s.is_active ? "Deactivate" : "Activate"}>
                              <Power className={`h-4 w-4 ${s.is_active ? "text-emerald-600" : "text-slate-400"}`} />
                            </Button>
                            {!s.is_system && (
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteState(s)} title="Delete">
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" /> Record Material Movement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Item *</Label>
                <Input
                  list="ms-item-list"
                  value={move.item_name || ""}
                  onChange={(e) => setMove((m) => ({ ...m, item_name: e.target.value }))}
                  placeholder="Type or pick from existing items"
                  autoComplete="off"
                />
                <datalist id="ms-item-list">
                  {items.filter((i) => i.name).map((i, idx) => (
                    <option key={idx} value={i.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={move.qty || 0}
                  onChange={(e) => setMove((m) => ({ ...m, qty: e.target.value }))}
                />
              </div>
              <div>
                <Label>Reference Type</Label>
                <select
                  value={move.ref_type || "Manual"}
                  onChange={(e) => setMove((m) => ({ ...m, ref_type: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10"
                >
                  {REF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>From State</Label>
                <select
                  value={move.from_state || ""}
                  onChange={(e) => setMove((m) => ({ ...m, from_state: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10"
                >
                  <option value="">— None (new inward) —</option>
                  {activeStates.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>To State</Label>
                <select
                  value={move.to_state || ""}
                  onChange={(e) => setMove((m) => ({ ...m, to_state: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10"
                >
                  <option value="">— None (removed from system) —</option>
                  {activeStates.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Ref Code</Label>
                <Input
                  value={move.ref_code || ""}
                  onChange={(e) => setMove((m) => ({ ...m, ref_code: e.target.value }))}
                  placeholder="e.g. WO-0001"
                />
              </div>
              <div>
                <Label>Lot No</Label>
                <Input
                  value={move.lot_no || ""}
                  onChange={(e) => setMove((m) => ({ ...m, lot_no: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="col-span-2">
                <Label>Location</Label>
                <Input
                  value={move.location || ""}
                  onChange={(e) => setMove((m) => ({ ...m, location: e.target.value }))}
                  placeholder="Bin / rack / vendor name"
                />
              </div>
              <div className="col-span-2">
                <Label>Note</Label>
                <Textarea
                  rows={2}
                  value={move.note || ""}
                  onChange={(e) => setMove((m) => ({ ...m, note: e.target.value }))}
                  placeholder="Why this movement?"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)} disabled={moveSaving}>Cancel</Button>
            <Button onClick={saveMove} disabled={moveSaving} className="bg-red-600 hover:bg-red-700 text-white">
              {moveSaving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : "Record Movement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stateOpen} onOpenChange={setStateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{stateEditing ? `Edit State — ${stateEditing.name}` : "Add New State"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input
                value={stateForm.name || ""}
                onChange={(e) => setStateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Anodizing"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={stateForm.description || ""}
                onChange={(e) => setStateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional explanation"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Color</Label>
                <select
                  value={stateForm.color || "slate"}
                  onChange={(e) => setStateForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10"
                >
                  {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="mt-1">
                  <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-sm border ${COLOR_CLASSES[stateForm.color] || COLOR_CLASSES.slate}`}>
                    Preview
                  </span>
                </div>
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={stateForm.sort_order ?? 100}
                  onChange={(e) => setStateForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={stateForm.is_active}
                  onChange={(e) => setStateForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active (shows in movement dropdowns)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStateOpen(false)} disabled={stateSaving}>Cancel</Button>
            <Button onClick={saveState} disabled={stateSaving} className="bg-red-600 hover:bg-red-700 text-white">
              {stateSaving ? "Saving…" : (stateEditing ? "Update" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
