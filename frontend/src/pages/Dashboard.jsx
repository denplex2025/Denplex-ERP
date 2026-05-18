import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Stat, Card, Empty, Th, Td, inr, fmtDate } from "@/components/erp/Primitives";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Boxes, ClipboardList, ShieldCheck, Users } from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then(r => setStats(r.data)).catch(()=>{});
  }, []);

  return (
    <div data-testid="dashboard-page">
      <PageHeader overline="Operations" title="Dashboard" subtitle="Live picture of your workshop." />
      {!stats ? (
        <div className="text-slate-500">Loading...</div>
      ) : (
        <>
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
