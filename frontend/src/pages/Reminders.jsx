import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Card, Th, Td, Empty } from "@/components/erp/Primitives";
import { Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Reminders() {
  const [data, setData] = useState({ overdue: [], total_overdue: 0, count: 0 });
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/reports/overdue"); setData(r.data || { overdue: [] }); }
    catch (e) { toast.error("Could not load overdue invoices"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const visible = (data.overdue || []).filter(r => !q || `${r.customer_name} ${r.code}`.toLowerCase().includes(q.toLowerCase()));
  const sev = (d) => d >= 60 ? "bg-red-100 text-red-700" : d >= 30 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";

  return (
    <div data-testid="reminders-page">
      <PageHeader
        overline="Accounts"
        title="Payment Reminders"
        subtitle="Open invoices past their due date. Follow up to collect outstanding payments."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-xl">
        <Card><div className="p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Total Overdue</div><div className="text-2xl font-bold text-red-600">{inr(data.total_overdue)}</div></div></Card>
        <Card><div className="p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Overdue Invoices</div><div className="text-2xl font-bold">{data.count || 0}</div></div></Card>
      </div>

      <div className="relative mb-3 max-w-xs">
        <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer / invoice…" className="w-full h-9 pl-8 pr-3 rounded-sm border border-slate-200 text-sm" />
      </div>

      <Card>
        {loading ? <Empty label="Loading…" /> : visible.length === 0 ? <Empty label="Nothing overdue. All caught up." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th>Customer</Th><Th>Invoice</Th><Th>Due Date</Th><Th>Overdue</Th><Th className="text-right">Outstanding</Th></tr></thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td className="font-medium">{r.customer_name || "—"}</Td>
                    <Td><span className="font-mono-tech text-xs">{r.code}</span></Td>
                    <Td className="whitespace-nowrap text-slate-500">{r.due_date}</Td>
                    <Td><span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11px] font-semibold ${sev(r.days_overdue)}`}><AlertTriangle className="w-3 h-3" /> {r.days_overdue}d</span></Td>
                    <Td className="text-right font-mono-tech text-red-700">{inr(r.outstanding)}</Td>
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
