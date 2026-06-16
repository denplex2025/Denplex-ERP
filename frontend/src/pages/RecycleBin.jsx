import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { useAuth } from "@/lib/auth";
import { RotateCcw, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export default function RecycleBin() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/recycle-bin"); setRows(r.data || []); }
    catch (e) { toast.error("Could not load recycle bin"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const restore = async (it) => {
    try { await api.post(`/recycle-bin/${it.id}/restore`); toast.success(`Restored ${it.label}`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Restore failed"); }
  };
  const purge = async (it) => {
    if (!window.confirm(`Permanently delete this ${it.label}? This cannot be undone.`)) return;
    try { await api.delete(`/recycle-bin/${it.id}`); toast.success("Permanently deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const emptyAll = async () => {
    if (!window.confirm("Permanently delete EVERYTHING in the recycle bin? This cannot be undone.")) return;
    try { const r = await api.delete("/recycle-bin"); toast.success(`Emptied (${r.data?.deleted || 0} removed)`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const visible = rows.filter(r => !q || `${r.label} ${r.title} ${r.deleted_by}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div data-testid="recycle-bin-page">
      <PageHeader
        overline="Utilities"
        title="Recycle Bin"
        subtitle="Records you delete are kept here so they can be restored. Permanent deletion cannot be undone."
        actions={isAdmin && rows.length > 0 ? <Button variant="outline" className="rounded-sm text-red-600 border-red-200" onClick={emptyAll}><Trash2 className="h-4 w-4 mr-1" /> Empty trash</Button> : null}
      />

      <div className="relative mb-3 max-w-xs">
        <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search deleted items…" className="w-full h-9 pl-8 pr-3 rounded-sm border border-slate-200 text-sm" />
      </div>

      <Card>
        {loading ? <Empty label="Loading…" /> : visible.length === 0 ? <Empty label="Recycle bin is empty." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th>Type</Th><Th>Record</Th><Th>Deleted by</Th><Th>Deleted on</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {visible.map(it => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <Td><span className="text-[10px] uppercase tracking-wider text-red-600 font-semibold">{it.label}</span></Td>
                    <Td className="font-medium">{it.title || "—"}</Td>
                    <Td>{it.deleted_by || "—"}</Td>
                    <Td className="whitespace-nowrap text-slate-500">{fmtDate(it.deleted_at)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" className="rounded-sm mr-2" onClick={() => restore(it)}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Delete forever" onClick={() => purge(it)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
