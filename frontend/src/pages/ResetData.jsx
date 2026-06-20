import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, RefreshCw, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function ResetData() {
  const [groups, setGroups] = useState([]);
  const [sel, setSel] = useState({});
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/admin/reset-data/preview"); setGroups(r.data?.groups || []); }
    catch (e) { toast.error(e?.response?.data?.detail || "Admin only — could not load"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = (k) => setSel(s => ({ ...s, [k]: !s[k] }));
  const chosen = groups.filter(g => sel[g.key]);
  const totalToDelete = chosen.reduce((a, g) => a + g.total, 0);
  const canRun = chosen.length > 0 && confirm === "RESET" && !busy;

  const run = async () => {
    if (!canRun) return;
    if (!window.confirm(`Permanently delete ${totalToDelete} records across ${chosen.length} group(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await api.post("/admin/reset-data", { groups: chosen.map(g => g.key), confirm: "RESET" });
      toast.success(`Purged ${r.data?.total ?? 0} records`);
      setSel({}); setConfirm("");
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Reset failed"); }
    setBusy(false);
  };

  return (
    <div className="pb-10 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <Trash2 className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">Reset Trial Data</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">Permanently clear imported / trial data so you can do a clean re-import. Pick the groups to wipe. This is a <strong>hard delete</strong> — it skips the Recycle Bin and cannot be undone.</p>

      <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 mb-4">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Users, settings, ISO documents, production registers, calibration instruments, machines and HR are <strong>protected</strong> and will never be deleted by this tool.</span>
      </div>

      <div className="space-y-2 mb-5">
        {loading && <div className="text-slate-400 text-sm p-4">Loading current counts…</div>}
        {!loading && groups.map(g => (
          <label key={g.key} className={`flex items-start gap-3 border rounded-md p-3 cursor-pointer transition ${sel[g.key] ? "border-red-400 bg-red-50/50" : "border-slate-200 hover:bg-slate-50"}`}>
            <input type="checkbox" checked={!!sel[g.key]} onChange={() => toggle(g.key)} className="mt-1 accent-red-600 h-4 w-4" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{g.label}</span>
                <span className={`text-sm tabular-nums ${g.total ? "text-slate-700" : "text-slate-400"}`}>{g.total} records</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{g.cols.join(", ")}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Type <strong>RESET</strong> to confirm</div>
          <Input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="RESET" className="w-40" />
        </div>
        <div className="text-sm text-slate-500 mt-5">
          {chosen.length ? <>Will delete <strong className="text-red-600">{totalToDelete}</strong> records in {chosen.length} group(s).</> : "Select at least one group."}
        </div>
        <div className="ml-auto flex items-center gap-2 mt-5">
          <Button variant="outline" className="rounded-sm" onClick={load} disabled={busy}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
          <Button onClick={run} disabled={!canRun} className="rounded-sm bg-red-600 hover:bg-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4 mr-1" /> {busy ? "Purging…" : "Purge Selected"}</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400 mt-6">
        <ShieldCheck className="h-3.5 w-3.5" /> Admin-only. Every purge is written to the audit log.
      </div>
    </div>
  );
}
