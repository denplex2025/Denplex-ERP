import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/erp/Primitives";
import StatusBadge from "@/components/erp/StatusBadge";
import { CalendarRange, Cpu, AlertTriangle, Loader2, ArrowRight } from "lucide-react";

const COLS = [
  { key: "overdue",   label: "Overdue",   tone: "border-l-red-600 bg-red-50/40",     badge: "overdue" },
  { key: "today",     label: "Today",     tone: "border-l-amber-500 bg-amber-50/40", badge: "qc" },
  { key: "this_week", label: "This Week",  tone: "border-l-blue-500 bg-blue-50/30",   badge: "in_progress" },
  { key: "later",     label: "Later",      tone: "border-l-slate-400 bg-slate-50",    badge: "planned" },
  { key: "no_date",   label: "No Due Date", tone: "border-l-slate-300 bg-white",      badge: "draft" },
];

export default function Planning() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/planning/overview")
      .then((r) => setD(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || "Failed to load planning"));
  }, []);

  const maxMin = Math.max(1, ...((d?.machine_load || []).map((m) => m.minutes)));

  return (
    <div className="space-y-5 p-2 md:p-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-red-600 font-semibold">Production</div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarRange className="w-6 h-6 text-red-600" /> Planning &amp; Schedule</h1>
        <p className="text-sm text-slate-500">Machine loading and due-date schedule, built from open work-order operations.</p>
      </div>

      {err && <Card className="p-6 text-center text-sm text-slate-500">{err}</Card>}
      {!d && !err && <Card className="p-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></Card>}

      {d && (<>
        {/* Machine loading */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Machine Loading</h2>
            <span className="text-xs text-slate-400">(planned backlog of open operations)</span>
          </div>
          {(d.machine_load || []).length === 0 ? (
            <div className="text-sm text-slate-400 py-4 text-center">No operations scheduled yet. Add routing to work orders to see machine load.</div>
          ) : (
            <div className="space-y-2">
              {d.machine_load.map((m, i) => {
                const pct = Math.round((m.minutes / maxMin) * 100);
                const hot = i === 0 && m.minutes > 0;
                return (
                  <div key={m.machine} className="flex items-center gap-3">
                    <div className="w-40 truncate text-sm font-medium text-slate-700 flex items-center gap-1">
                      {hot && <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />}
                      {m.machine}
                    </div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-sm overflow-hidden">
                      <div className={`h-full ${hot ? "bg-red-500" : m.running ? "bg-blue-500" : "bg-slate-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-28 text-right text-xs text-slate-500 tabular-nums">
                      {m.hours}h · {m.ops} op{m.ops !== 1 ? "s" : ""}{m.running ? ` · ${m.running}▶` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Due-date schedule board */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-3">Due-Date Schedule · {d.active_wo} active work orders</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {COLS.map((c) => {
              const b = d.buckets?.[c.key] || { count: 0, items: [] };
              return (
                <Card key={c.key} className={`p-3 border-l-4 ${c.tone}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">{c.label}</span>
                    <span className="text-sm font-bold text-slate-700">{b.count}</span>
                  </div>
                  <div className="space-y-1.5">
                    {b.items.length === 0 ? (
                      <div className="text-xs text-slate-400 py-2 text-center">—</div>
                    ) : b.items.map((w) => (
                      <Link key={w.id} to={`/app/scan/work-order/${w.id}`}
                        className="block border border-slate-100 rounded-sm p-2 hover:bg-white hover:shadow-sm transition">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700 truncate">{w.code || "WO"}</span>
                          <StatusBadge status={w.status} />
                        </div>
                        <div className="text-xs text-slate-500 truncate">{w.product || w.part_number || "—"}</div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                          <span className="truncate">{w.customer_name || ""}</span>
                          <span className="whitespace-nowrap">{w.due_date || ""}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </>)}
    </div>
  );
}
