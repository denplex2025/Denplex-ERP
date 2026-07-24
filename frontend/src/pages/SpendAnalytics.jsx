import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { PageHeader, Card, Th, Td, Empty, inr } from "@/components/erp/Primitives";
import { IndianRupee, Receipt, Truck, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { toast } from "sonner";

const fmtMonth = (m) => {
  if (!m) return m;
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

/** Procurement > Inventory & Spend Analytics. Pure aggregation over existing purchase-bill data
 * (GET /reports/purchase-spend) — no new schema. Spend by supplier, month-over-month trend, and
 * top purchased items by amount, so purchasing habits/costs are visible without leaving the app. */
export default function SpendAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const r = await api.get(`/reports/purchase-spend?${params.toString()}`);
      setData(r.data);
    } catch { toast.error("Failed to load spend analytics"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyRange = () => load();

  return (
    <div data-testid="spend-analytics-page">
      <PageHeader
        overline="Procurement"
        title="Inventory & Spend Analytics"
        subtitle="Real-time reporting on purchasing habits and costs — built from your existing purchase bill data."
      />

      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Range:</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-sm h-8 w-36 text-xs" />
          <span className="text-slate-400 text-xs">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-sm h-8 w-36 text-xs" />
          <button onClick={applyRange} className="text-xs text-red-600 hover:underline font-semibold ml-1">Apply</button>
          {data?.range && (
            <span className="text-xs text-slate-400 ml-auto">Showing {data.range.from} → {data.range.to}</span>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
      ) : !data ? (
        <Empty label="No data." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white border border-slate-200 border-l-4 border-l-red-600 rounded-sm p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1"><IndianRupee className="h-3 w-3" /> Total Spend</div>
              <div className="font-display text-xl font-bold text-slate-900 mt-1">{inr(data.total_spend)}</div>
            </div>
            <div className="bg-white border border-slate-200 border-l-4 border-l-slate-400 rounded-sm p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1"><Receipt className="h-3 w-3" /> Purchase Bills</div>
              <div className="font-display text-xl font-bold text-slate-900 mt-1">{data.bill_count}</div>
            </div>
            <div className="bg-white border border-slate-200 border-l-4 border-l-slate-400 rounded-sm p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1"><Truck className="h-3 w-3" /> Suppliers</div>
              <div className="font-display text-xl font-bold text-slate-900 mt-1">{data.supplier_count}</div>
            </div>
            <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-sm p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Top Supplier</div>
              <div className="font-display text-sm font-bold text-slate-900 mt-1 truncate" title={data.top_supplier?.supplier}>
                {data.top_supplier ? data.top_supplier.supplier : "—"}
              </div>
              {data.top_supplier && <div className="text-xs text-slate-500">{inr(data.top_supplier.amount)}</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Spend by Supplier (Top 15)</div>
              {data.by_supplier.length === 0 ? <Empty label="No purchase bills in range." /> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_supplier} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" fontSize={10} stroke="#64748b" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="supplier" width={140} fontSize={10} stroke="#64748b" tick={{ width: 130 }} />
                      <Tooltip formatter={(v) => inr(v)} />
                      <Bar dataKey="amount" fill="#dc2626" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Spend Trend (by Month)</div>
              {data.by_month.length === 0 ? <Empty label="No purchase bills in range." /> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.by_month.map((m) => ({ ...m, label: fmtMonth(m.month) }))}>
                      <defs>
                        <linearGradient id="spendG" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" fontSize={10} stroke="#64748b" />
                      <YAxis fontSize={10} stroke="#64748b" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => inr(v)} />
                      <Area type="monotone" dataKey="amount" stroke="#dc2626" fill="url(#spendG)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card>
            <div className="p-4 border-b border-slate-200">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Top Purchased Items (by Amount)</div>
            </div>
            {data.by_item.length === 0 ? <Empty label="No purchase bills in range." /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <Th>Item / Description</Th>
                    <Th className="text-right">Total Qty</Th>
                    <Th className="text-right">Amount</Th>
                  </tr></thead>
                  <tbody>
                    {data.by_item.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <Td className="truncate max-w-xs">{row.item}</Td>
                        <Td className="text-right font-mono-tech">{row.qty}</Td>
                        <Td className="text-right font-mono-tech">{inr(row.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
