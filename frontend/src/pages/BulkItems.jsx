import { useEffect, useState, useMemo } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader, Card, Th, Td, Empty } from "@/components/erp/Primitives";
import { Save, Search } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  { key: "unit_cost", label: "Unit Cost (₹)", type: "number" },
  { key: "qty_on_hand", label: "Qty on Hand", type: "number" },
  { key: "reorder_level", label: "Reorder", type: "number" },
  { key: "hsn", label: "HSN", type: "text" },
  { key: "gst_rate", label: "GST %", type: "number" },
];

export default function BulkItems() {
  const [items, setItems] = useState([]);
  const [edits, setEdits] = useState({});   // { id: { field: value } }
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/inventory/items"); setItems(r.data || []); setEdits({}); }
    catch (e) { toast.error("Could not load items"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setCell = (id, field, value) => setEdits(p => ({ ...p, [id]: { ...(p[id] || {}), [field]: value } }));
  const valOf = (it, field) => (edits[it.id] && edits[it.id][field] !== undefined) ? edits[it.id][field] : (it[field] ?? "");

  const changedCount = Object.keys(edits).length;
  const saveAll = async () => {
    const updates = Object.entries(edits).map(([id, fields]) => {
      const clean = { id };
      for (const [k, v] of Object.entries(fields)) {
        const f = FIELDS.find(x => x.key === k);
        clean[k] = f && f.type === "number" ? Number(v) : v;
      }
      return clean;
    });
    if (!updates.length) { toast.info("No changes to save"); return; }
    setSaving(true);
    try { const r = await api.post("/inventory/items/bulk-update", { updates }); toast.success(`Updated ${r.data?.updated ?? updates.length} items`); await load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Bulk update failed"); }
    setSaving(false);
  };

  const visible = useMemo(() => items.filter(it => !q || `${it.sku} ${it.name} ${it.hsn || ""}`.toLowerCase().includes(q.toLowerCase())), [items, q]);

  return (
    <div data-testid="bulk-items-page">
      <PageHeader
        overline="Utilities"
        title="Bulk Update Items"
        subtitle="Edit price, stock, reorder, HSN and GST for many items at once, then save in one click."
        actions={<Button onClick={saveAll} disabled={saving || changedCount === 0} className="rounded-sm bg-red-600 hover:bg-red-700"><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : `Save${changedCount ? ` (${changedCount})` : ""}`}</Button>}
      />

      <div className="relative mb-3 max-w-xs">
        <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" className="w-full h-9 pl-8 pr-3 rounded-sm border border-slate-200 text-sm" />
      </div>

      <Card>
        {loading ? <Empty label="Loading…" /> : visible.length === 0 ? <Empty label="No items." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th>SKU</Th><Th>Name</Th>{FIELDS.map(f => <Th key={f.key}>{f.label}</Th>)}</tr></thead>
              <tbody>
                {visible.map(it => {
                  const dirty = !!edits[it.id];
                  return (
                    <tr key={it.id} className={dirty ? "bg-amber-50" : "hover:bg-slate-50"}>
                      <Td><span className="font-mono-tech text-xs">{it.sku}</span></Td>
                      <Td className="max-w-[220px] truncate">{it.name}</Td>
                      {FIELDS.map(f => (
                        <Td key={f.key}>
                          <input
                            type={f.type}
                            value={valOf(it, f.key)}
                            onChange={e => setCell(it.id, f.key, e.target.value)}
                            className="w-24 h-8 px-2 rounded-sm border border-slate-200 text-sm focus:border-red-300 focus:outline-none"
                          />
                        </Td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
