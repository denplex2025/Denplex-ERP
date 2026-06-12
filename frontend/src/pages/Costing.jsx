import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/erp/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/erp/StatusBadge";
import { toast } from "sonner";
import { Calculator, Cpu, Users, IndianRupee, Loader2, Save } from "lucide-react";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Costing() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [rates, setRates] = useState({ machine: 400, labour: 120 });
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/costing/overview")
    .then((r) => { setD(r.data); setRates(r.data.rates || { machine: 400, labour: 120 }); })
    .catch((e) => setErr(e?.response?.data?.detail || "Failed to load costing"));
  useEffect(() => { load(); }, []);

  const saveRates = async () => {
    setSaving(true);
    try {
      await api.put("/costing/rates", { default_machine_rate: Number(rates.machine) || 0, default_labour_rate: Number(rates.labour) || 0 });
      toast.success("Rates saved — recalculating"); await load();
    } catch (e) { toast.error("Failed to save rates"); }
    setSaving(false);
  };

  return (
    <div className="space-y-5 p-2 md:p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-red-600 font-semibold">Accounts</div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Calculator className="w-6 h-6 text-red-600" /> Costing & Profitability</h1>
          <p className="text-sm text-slate-500">Job cost per work order, machine & operator cost, and customer profitability — from operation time × rates.</p>
        </div>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Default rates (used where a machine has no rate)</div>
          <div className="flex items-end gap-2">
            <div><label className="text-[11px] text-slate-500">Machine ₹/hr</label><Input type="number" className="h-8 w-24" value={rates.machine} onChange={(e) => setRates((p) => ({ ...p, machine: e.target.value }))} /></div>
            <div><label className="text-[11px] text-slate-500">Labour ₹/hr</label><Input type="number" className="h-8 w-24" value={rates.labour} onChange={(e) => setRates((p) => ({ ...p, labour: e.target.value }))} /></div>
            <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700" onClick={saveRates} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button>
          </div>
        </Card>
      </div>

      {err && <Card className="p-6 text-center text-sm text-slate-500">{err}</Card>}
      {!d && !err && <Card className="p-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></Card>}

      {d && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 border-l-4 border-l-red-600"><div className="text-xs uppercase tracking-wider text-slate-500">WIP / Job Cost</div><div className="text-2xl font-bold text-slate-800">{inr(d.totals?.wip_cost)}</div></Card>
          <Card className="p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Work Orders costed</div><div className="text-2xl font-bold text-slate-800">{d.totals?.wo_count || 0}</div></Card>
          <Card className="p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Machine ₹/hr</div><div className="text-2xl font-bold text-slate-800">₹{d.rates?.machine}</div></Card>
          <Card className="p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Labour ₹/hr</div><div className="text-2xl font-bold text-slate-800">₹{d.rates?.labour}</div></Card>
        </div>

        {/* Job costing per WO */}
        <Card className="p-0">
          <div className="px-4 py-3 border-b text-sm font-semibold uppercase tracking-wider text-slate-600">Job Costing — per Work Order</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="text-left px-4 py-2">WO</th><th className="text-left px-4 py-2">Customer</th><th className="text-right px-4 py-2">Qty</th><th className="text-right px-4 py-2">Machining</th><th className="text-right px-4 py-2">Labour</th><th className="text-right px-4 py-2">Material</th><th className="text-right px-4 py-2">Total</th><th className="text-right px-4 py-2">₹/pc</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody>
                {(d.per_wo || []).length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-400 text-sm">No costed work orders yet. Add operations (with machines) to work orders to see job costs.</td></tr>
                ) : d.per_wo.map((w) => (
                  <tr key={w.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-2"><Link to={`/app/scan/work-order/${w.id}`} className="font-medium text-red-600 hover:underline">{w.code || "WO"}</Link><div className="text-xs text-slate-400">{w.product}</div></td>
                    <td className="px-4 py-2">{w.customer || "—"}</td>
                    <td className="px-4 py-2 text-right">{w.qty}</td>
                    <td className="px-4 py-2 text-right">{inr(w.machining_cost)}</td>
                    <td className="px-4 py-2 text-right">{inr(w.labour_cost)}</td>
                    <td className="px-4 py-2 text-right">{inr(w.material_cost)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{inr(w.total_cost)}</td>
                    <td className="px-4 py-2 text-right">{inr(w.cost_per_pc)}</td>
                    <td className="px-4 py-2"><StatusBadge status={w.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2"><Cpu className="w-4 h-4 text-slate-500" /><h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Machine Costing</h2></div>
            {(d.per_machine || []).length === 0 ? <div className="text-sm text-slate-400 py-3 text-center">No machine usage yet.</div> : (
              <div className="space-y-1.5">{d.per_machine.map((m) => (
                <div key={m.machine} className="flex items-center justify-between text-sm border-b border-slate-100 pb-1">
                  <span className="font-medium text-slate-700 truncate">{m.machine}</span>
                  <span className="text-slate-500 text-xs">{m.hours}h · {m.ops} ops · <span className="font-semibold text-slate-700">{inr(m.cost)}</span></span>
                </div>))}</div>
            )}
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-slate-500" /><h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Operator Productivity</h2></div>
            {(d.per_operator || []).length === 0 ? <div className="text-sm text-slate-400 py-3 text-center">No operator activity yet.</div> : (
              <div className="space-y-1.5">{d.per_operator.map((o) => (
                <div key={o.operator} className="flex items-center justify-between text-sm border-b border-slate-100 pb-1">
                  <span className="font-medium text-slate-700 truncate">{o.operator}</span>
                  <span className="text-slate-500 text-xs">{o.hours}h · {o.done}/{o.ops} done</span>
                </div>))}</div>
            )}
          </Card>
        </div>

        {/* Customer profitability */}
        <Card className="p-0">
          <div className="px-4 py-3 border-b text-sm font-semibold uppercase tracking-wider text-slate-600">Customer Profitability</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="text-left px-4 py-2">Customer</th><th className="text-right px-4 py-2">Revenue (invoiced)</th><th className="text-right px-4 py-2">Work cost</th><th className="text-right px-4 py-2">Margin</th></tr>
              </thead>
              <tbody>
                {(d.per_customer || []).length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-slate-400 text-sm">No customer revenue yet.</td></tr>
                ) : d.per_customer.map((c) => (
                  <tr key={c.customer} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">{c.customer}</td>
                    <td className="px-4 py-2 text-right">{inr(c.revenue)}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{inr(c.work_cost)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${c.margin >= 0 ? "text-emerald-700" : "text-red-700"}`}>{inr(c.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-slate-400">Costs are computed from operation time × machine/labour rates (and material issued to each WO). Set per-machine ₹/hr in the Machines page; the default rates above fill any gaps.</p>
      </>)}
    </div>
  );
}
