import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Stat, Card, Empty, Th, Td, inr, fmtDate } from "@/components/erp/Primitives";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Boxes, ClipboardList, ShieldCheck, Users, ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [money, setMoney] = useState(null);
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then(r => setStats(r.data)).catch(()=>{});
    api.get("/dashboard/receivable-payable").then(r => setMoney(r.data)).catch(()=>{});
    api.get("/dashboard/sales-trend?days=30").then(r => setTrend(r.data)).catch(()=>{});
  }, []);

  return (
    <div data-testid="dashboard-page">
      <PageHeader overline="Operations" title="Dashboard" subtitle="Live picture of your workshop." />
      {!stats ? (
        <div className="text-slate-500">Loading...</div>
      ) : (
        <>
          {/* Receivable / payable summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Receivable</div>
                  <div className="font-display text-3xl font-bold mt-2 text-emerald-700">{inr(money?.receivable_total || 0)}</div>
                  <div className="text-xs text-slate-500 mt-1">From <strong>{money?.receivable_parties_count || 0}</strong> Parties</div>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center"><ArrowDownToLine className="h-5 w-5 text-emerald-600" /></div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Payable</div>
                  <div className="font-display text-3xl font-bold mt-2 text-red-700">{inr(money?.payable_total || 0)}</div>
                  <div className="text-xs text-slate-500 mt-1">From <strong>{money?.payable_parties_count || 0}</strong> Parties</div>
                </div>
                <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center"><ArrowUpFromLine className="h-5 w-5 text-red-600" /></div>
              </div>
            </Card>
          </div>

          {/* Sales trend chart */}
          {trend?.series?.length > 0 && (
            <Card className="mb-4">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-500" />
                <div className="font-display font-semibold">Total Sale</div>
                <div className="text-xs text-slate-500 ml-auto">Last {trend.days} days</div>
              </div>
              <div className="px-3 pt-3 pb-4" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend.series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#DC2626" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={d => d ? d.slice(5) : ""} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0) + "k" : v} />
                    <Tooltip formatter={v => inr(v)} contentStyle={{ fontSize: 12, borderRadius: 2 }} />
                    <Area type="monotone" dataKey="total" stroke="#DC2626" strokeWidth={2} fill="url(#salesGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Stat testid="stat-open-wo" label="Open WO" value={stats.open_wo} />
            <Stat testid="stat-qc-pending" label="QC Pending" value={stats.qc_pending} accent="text-amber-700" />
            <Stat testid="stat-low-stock" label="Low Stock" value={stats.low_stock_count} accent={stats.low_stock_count > 0 ? "text-red-700" : ""} />
            <Stat testid="stat-leads" label="Open Leads" value={stats.leads_open} />
            <Stat testid="stat-customers" label="Customers" value={stats.customers} hint={`${stats.repeat_customers} repeat`} />
            <Stat testid="stat-revenue" label="Revenue" value={inr(stats.revenue)} accent="text-emerald-700" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <Card className="lg:col-span-2">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-slate-500" />
                <div className="font-display font-semibold">Recent work orders</div>
              </div>
              {stats.recent_wo?.length ? (
                <table className="w-full">
                  <thead>
                    <tr><Th>Code</Th><Th>Customer</Th><Th>Product</Th><Th>Qty</Th><Th>Status</Th><Th>Due</Th></tr>
                  </thead>
                  <tbody>
                    {stats.recent_wo.map(w => (
                      <tr key={w.id}>
                        <Td className="font-mono-tech text-xs">{w.code}</Td>
                        <Td>{w.customer_name || "—"}</Td>
                        <Td>{w.product}</Td>
                        <Td>{w.qty}</Td>
                        <Td><Badge variant="outline" className="rounded-sm uppercase text-[10px]">{w.status}</Badge></Td>
                        <Td>{fmtDate(w.due_date)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Empty label="No work orders yet." />}
            </Card>

            <Card>
              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <div className="font-display font-semibold">Low stock</div>
              </div>
              {stats.low_stock_items?.length ? (
                <ul className="divide-y divide-slate-100">
                  {stats.low_stock_items.map(it => (
                    <li key={it.id} className="px-5 py-2.5 text-sm flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-900">{it.name}</div>
                        <div className="text-xs text-slate-500 font-mono-tech">{it.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono-tech text-sm">{it.qty_on_hand} {it.uom}</div>
                        <div className="text-xs text-slate-500">min {it.reorder_level}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <Empty label="All items above reorder level." />}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
