import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Factory, AlertTriangle, ClipboardCheck, Truck, PackageX,
  TrendingUp, TrendingDown, IndianRupee, ArrowRight, Gauge,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { LiveWorkflowBar } from "@/components/erp/WorkflowBar";
import StatusBadge from "@/components/erp/StatusBadge";

const fmtINR = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);

// M.4b hotfix: defensive array coercion — backend may return non-arrays
const asArr = (v) => Array.isArray(v) ? v : [];

function MetricTile({ icon: Icon, label, value, sublabel, color = "slate", to }) {
  const colorMap = {
    blue:    { bg: "bg-blue-50",    text: "text-blue-700",    icon: "text-blue-600",    border: "border-l-blue-500" },
    red:     { bg: "bg-red-50",     text: "text-red-700",     icon: "text-red-600",     border: "border-l-red-600" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-700",   icon: "text-amber-600",   border: "border-l-amber-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "text-emerald-600", border: "border-l-emerald-500" },
    slate:   { bg: "bg-slate-50",   text: "text-slate-700",   icon: "text-slate-600",   border: "border-l-slate-400" },
  };
  const c = colorMap[color] || colorMap.slate;
  const inner = (
    <Card className={`border-l-4 ${c.border} hover:shadow-md transition-shadow`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">{label}</div>
            <div className={`text-3xl font-bold ${c.text} mt-1 leading-tight`}>{value}</div>
            {sublabel && <div className="text-xs text-slate-500 mt-1 truncate">{sublabel}</div>}
          </div>
          <div className={`${c.bg} ${c.icon} rounded-lg p-2 ml-2 flex-shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

export default function Dashboard() {
  const [shopfloor, setShopfloor] = useState(null);
  const [stats, setStats] = useState({
    receivable: 0, payable: 0, today_sales: 0, month_sales: 0,
    recent_wo: [], low_stock: [], sales_trend: [],
  });

  useEffect(() => {
    // Parallel fetch with 6s timeout so a slow endpoint can't hang the page
    const withTimeout = (p, ms = 6000) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

    withTimeout(api.get("/dashboard/shopfloor", { silent: true }))
      .then((r) => setShopfloor(r.data))
      .catch((e) => { console.warn("shopfloor slow/failed:", e.message); setShopfloor({}); });

    withTimeout(api.get("/dashboard/summary", { silent: true }))
      .then((r) => setStats((s) => ({ ...s, ...r.data })))
      .catch((e) => { console.warn("summary slow/failed:", e.message); });
  }, []);

  const m = shopfloor || {};
  const stages = asArr(m.workflow_stages);
  const activeWO =
    (stages.find((s) => s.key === "in_progress")?.count || 0) +
    (stages.find((s) => s.key === "planned")?.count || 0);
  const qcPending = stages.find((s) => s.key === "qc")?.count || 0;
  const completedToday = m.completed_today ?? stages.find((s) => s.key === "completed")?.count ?? 0;

  return (
    <div className="space-y-6 p-2 md:p-4">
      <LiveWorkflowBar />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Shop Floor</h2>
          <Link to="/app/work-orders" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            All work orders <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricTile icon={Factory} label="Active WO" value={activeWO}
            sublabel={`${stages.find((s) => s.key === "in_progress")?.count || 0} running`}
            color="blue" to="/app/work-orders" />
          <MetricTile icon={AlertTriangle} label="Delayed Jobs"
            value={asArr(m.delayed_jobs).length}
            sublabel={asArr(m.delayed_jobs).length ? "Past due date" : "On schedule"}
            color={asArr(m.delayed_jobs).length ? "red" : "slate"}
            to="/app/work-orders?filter=delayed" />
          <MetricTile icon={ClipboardCheck} label="QC Pending" value={qcPending}
            sublabel={qcPending ? "Awaiting inspection" : "Clear"}
            color={qcPending ? "amber" : "slate"} to="/app/qc" />
          <MetricTile icon={Truck} label="Today Dispatches"
            value={asArr(m.today_dispatches).length}
            sublabel={completedToday ? `${completedToday} completed today` : "—"}
            color="emerald" to="/app/docs/delivery-challans" />
          <MetricTile icon={PackageX} label="Material Shortage"
            value={asArr(m.material_shortage).length}
            sublabel={asArr(m.material_shortage).length ? "Below reorder" : "Adequate"}
            color={asArr(m.material_shortage).length ? "red" : "slate"}
            to="/app/inventory?filter=shortage" />
          <MetricTile icon={Gauge} label="Machine Util"
            value={m.machine_utilization_pct == null ? "—" : `${m.machine_utilization_pct}%`}
            sublabel={m.machines_total ? `${m.machines_running || 0}/${m.machines_total} running` : "Add machines"}
            color={m.machine_utilization_pct == null ? "slate" : (m.machine_utilization_pct >= 70 ? "emerald" : (m.machine_utilization_pct >= 40 ? "amber" : "red"))}
            to="/app/planning" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Delayed Jobs</span>
              {asArr(m.delayed_jobs).length > 0 && (
                <StatusBadge status="delayed" label={`${m.delayed_jobs.length} jobs`} />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {asArr(m.delayed_jobs).length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">No delayed jobs</div>
            ) : (
              <div className="space-y-2">
                {asArr(m.delayed_jobs).slice(0, 5).map((j, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-slate-100 pb-1">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-700 truncate">{j.wo_no || j.id}</div>
                      <div className="text-slate-500 truncate">{j.part_name || j.customer || "—"}</div>
                    </div>
                    <StatusBadge status={j.status || "delayed"} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Material Shortage</span>
              {asArr(m.material_shortage).length > 0 && (
                <StatusBadge status="overdue" label={`${m.material_shortage.length} items`} />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {asArr(m.material_shortage).length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">No shortages</div>
            ) : (
              <div className="space-y-2">
                {asArr(m.material_shortage).slice(0, 5).map((it, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-slate-100 pb-1">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-700 truncate">{it.name || it.part_number}</div>
                      <div className="text-slate-500">Stock: {it.qty_on_hand ?? 0} / Reorder: {it.reorder_level ?? "—"}</div>
                    </div>
                    <StatusBadge status="rejected" label="LOW" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(asArr(stats.sales_trend).length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Sales Trend (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={asArr(stats.sales_trend)}>
                <defs>
                  <linearGradient id="salesG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" fontSize={10} stroke="#64748b" />
                <YAxis fontSize={10} stroke="#64748b" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `₹${fmtINR(v)}`} />
                <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="url(#salesG)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Financial Snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Receivable</div>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 flex items-center">
                <IndianRupee className="w-5 h-5" />{fmtINR(stats.receivable)}
              </div>
              <Link to="/app/payments/in" className="text-xs text-blue-600 hover:underline">Manage payments →</Link>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Payable</div>
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
              <div className="text-2xl font-bold text-red-700 flex items-center">
                <IndianRupee className="w-5 h-5" />{fmtINR(stats.payable)}
              </div>
              <Link to="/app/payments/out" className="text-xs text-blue-600 hover:underline">Manage payments →</Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Today Sales</div>
              <div className="text-2xl font-bold text-slate-700 flex items-center">
                <IndianRupee className="w-5 h-5" />{fmtINR(stats.today_sales)}
              </div>
              <div className="text-xs text-slate-400 mt-1">Invoices issued today</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Month Sales</div>
              <div className="text-2xl font-bold text-slate-700 flex items-center">
                <IndianRupee className="w-5 h-5" />{fmtINR(stats.month_sales)}
              </div>
              <div className="text-xs text-slate-400 mt-1">This month to date</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {(asArr(stats.recent_wo).length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Recent Work Orders</span>
              <Link to="/app/work-orders" className="text-xs text-blue-600 hover:underline">See all</Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {asArr(stats.recent_wo).slice(0, 6).map((wo, i) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-slate-100 pb-1">
                  <div className="flex-1 min-w-0 grid grid-cols-3 gap-2">
                    <span className="font-medium text-slate-700 truncate">{wo.wo_no}</span>
                    <span className="text-slate-500 truncate">{wo.part_name || "—"}</span>
                    <span className="text-slate-400 truncate">{wo.customer || ""}</span>
                  </div>
                  <StatusBadge status={wo.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
