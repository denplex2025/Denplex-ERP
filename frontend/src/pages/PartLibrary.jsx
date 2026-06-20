import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, PackagePlus, Search, X, Library } from "lucide-react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const CATS = ["All", "Fastener", "Pneumatic", "Bearing", "Standard", "Electrical", "Other"];
const Fld = ({ label, children }) => (<div><Label className="text-[11px] uppercase tracking-wider text-slate-500">{label}</Label><div className="mt-1">{children}</div></div>);

export default function PartLibrary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [addTo, setAddTo] = useState(null);   // part being pushed to inventory
  const [newOpen, setNewOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/part-library"); setRows(r.data || []); }
    catch (e) { toast.error("Could not load part library"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r =>
      (cat === "All" || r.category === cat) &&
      (!ql || (`${r.name} ${r.standard} ${r.size} ${r.material} ${r.hsn}`).toLowerCase().includes(ql))
    );
  }, [rows, cat, q]);

  const counts = useMemo(() => {
    const m = { All: rows.length };
    for (const r of rows) m[r.category] = (m[r.category] || 0) + 1;
    return m;
  }, [rows]);

  const delPart = async (p) => {
    if (!window.confirm(`Delete "${p.name}" from the library?`)) return;
    try { await api.delete(`/part-library/${p.id}`); setRows(rs => rs.filter(x => x.id !== p.id)); toast.success("Removed"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not delete (admin/manager only)"); }
  };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Library className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">Standard Parts Library</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">Reusable catalog of common bought-out parts — fasteners, pneumatics, bearings, locating hardware. Add any to inventory in one click instead of re-typing.</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${cat === c ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {c}{counts[c] != null && c !== "All" ? <span className="opacity-70"> · {counts[c]}</span> : ""}{c === "All" ? <span className="opacity-70"> · {counts.All || 0}</span> : ""}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / size / standard…" className="pl-8 w-64" />
        </div>
        <Button onClick={() => setNewOpen(true)} className="rounded-sm bg-red-600 hover:bg-red-700"><Plus className="h-4 w-4 mr-1" /> New Part</Button>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-md">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="p-2">Category</th><th className="p-2 min-w-[200px]">Name</th><th className="p-2">Standard</th><th className="p-2">Size</th><th className="p-2">Material</th><th className="p-2">UOM</th><th className="p-2">HSN</th><th className="p-2">GST%</th><th className="p-2 text-right">Est. Cost</th><th className="p-2 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="p-6 text-center text-slate-400">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-400">No parts match.</td></tr>}
            {filtered.map(p => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="p-2"><span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.category}</span></td>
                <td className="p-2 font-medium text-slate-800">{p.name}</td>
                <td className="p-2 text-slate-500">{p.standard || "—"}</td>
                <td className="p-2 text-slate-500">{p.size || "—"}</td>
                <td className="p-2 text-slate-500">{p.material || "—"}</td>
                <td className="p-2 text-slate-500">{p.uom}</td>
                <td className="p-2 text-slate-500">{p.hsn || "—"}</td>
                <td className="p-2 text-slate-500">{p.gst_rate}</td>
                <td className="p-2 text-right font-mono-tech whitespace-nowrap">{p.unit_cost ? inr(p.unit_cost) : "—"}</td>
                <td className="p-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" className="rounded-sm h-7" onClick={() => setAddTo(p)}><PackagePlus className="h-3.5 w-3.5 mr-1" /> To Inventory</Button>
                    {!p.seeded && <button className="text-slate-300 hover:text-red-600 px-1" onClick={() => delPart(p)} title="Delete"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addTo && <AddToInventory part={addTo} onClose={() => setAddTo(null)} />}
      {newOpen && <NewPart onClose={() => setNewOpen(false)} onSaved={(p) => { setRows(rs => [...rs, p]); setNewOpen(false); }} />}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function AddToInventory({ part, onClose }) {
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(0);
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const go = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/part-library/${part.id}/to-inventory`, { sku: sku.trim(), qty_on_hand: Number(qty || 0), location: location.trim() });
      toast.success(`Added to inventory as ${r.data?.sku}`);
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not add"); }
    setSaving(false);
  };
  return (
    <Modal title="Add to Inventory" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">{part.name}</p>
      <div className="space-y-3">
        <Fld label="SKU (blank = auto)"><Input value={sku} onChange={e => setSku(e.target.value)} placeholder="auto-generated" /></Fld>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Opening Qty"><Input type="number" value={qty} onChange={e => setQty(e.target.value)} /></Fld>
          <Fld label="Location"><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Vatva / Santej" /></Fld>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" className="rounded-sm" onClick={onClose}>Cancel</Button>
        <Button onClick={go} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700">{saving ? "Adding…" : "Add"}</Button>
      </div>
    </Modal>
  );
}

function NewPart({ onClose, onSaved }) {
  const [f, setF] = useState({ category: "Fastener", name: "", standard: "", size: "", material: "", uom: "Nos", hsn: "", gst_rate: 18, unit_cost: 0 });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const go = async () => {
    if (!f.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const r = await api.post("/part-library", { ...f, gst_rate: Number(f.gst_rate || 0), unit_cost: Number(f.unit_cost || 0) });
      toast.success("Part added to library");
      onSaved(r.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    setSaving(false);
  };
  return (
    <Modal title="New Library Part" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Category">
            <select value={f.category} onChange={e => set("category", e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
              {CATS.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Fld>
          <Fld label="UOM"><Input value={f.uom} onChange={e => set("uom", e.target.value)} /></Fld>
        </div>
        <Fld label="Name *"><Input value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Socket Head Cap Screw M6x20" /></Fld>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Standard"><Input value={f.standard} onChange={e => set("standard", e.target.value)} placeholder="ISO 4762" /></Fld>
          <Fld label="Size"><Input value={f.size} onChange={e => set("size", e.target.value)} placeholder="M6x20" /></Fld>
        </div>
        <Fld label="Material"><Input value={f.material} onChange={e => set("material", e.target.value)} placeholder="Grade 12.9 / SS304" /></Fld>
        <div className="grid grid-cols-3 gap-3">
          <Fld label="HSN"><Input value={f.hsn} onChange={e => set("hsn", e.target.value)} /></Fld>
          <Fld label="GST%"><Input type="number" value={f.gst_rate} onChange={e => set("gst_rate", e.target.value)} /></Fld>
          <Fld label="Est. Cost"><Input type="number" value={f.unit_cost} onChange={e => set("unit_cost", e.target.value)} /></Fld>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" className="rounded-sm" onClick={onClose}>Cancel</Button>
        <Button onClick={go} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700">{saving ? "Saving…" : "Save"}</Button>
      </div>
    </Modal>
  );
}
