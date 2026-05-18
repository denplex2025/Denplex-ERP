import { useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cog, ArrowLeft, Search, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Portal() {
  const [ref, setRef] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const search = async (e) => {
    e.preventDefault();
    if (!ref.trim()) return;
    setLoading(true); setErr(""); setData(null);
    try {
      const r = await api.get(`/portal/track`, { params: { ref: ref.trim() } });
      setData(r.data);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Not found");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="portal-page">
      <header className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/denplex-logo.png" alt="Denplex" className="h-9 w-9 object-contain" />
            <span className="font-display font-bold tracking-tight">DENPLEX ERP</span>
          </Link>
          <Link to="/" className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Customer Portal</div>
        <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tight mt-2 text-slate-900">Track your order.</h1>
        <p className="text-slate-600 mt-3">Enter your PO number or our work order reference (e.g. WO-26-0001) to view progress, job cards, and QC results.</p>

        <form onSubmit={search} className="mt-10 flex gap-2" data-testid="portal-search-form">
          <Input
            placeholder="WO-26-0001 or your PO number"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className="h-12 rounded-sm border-slate-300 focus-visible:ring-red-600 text-base"
            data-testid="portal-ref-input"
          />
          <Button type="submit" disabled={loading} className="h-12 px-6 rounded-sm bg-red-600 hover:bg-red-700" data-testid="portal-search-button">
            <Search className="h-4 w-4 mr-2" /> {loading ? "Searching..." : "Track"}
          </Button>
        </form>

        {err && (
          <div className="mt-6 p-4 border border-red-200 bg-red-50 text-red-700 text-sm flex items-center gap-2" data-testid="portal-error">
            <AlertCircle className="h-4 w-4" /> {err}
          </div>
        )}

        {data && (
          <div className="mt-10 space-y-6 fade-up" data-testid="portal-result">
            <div className="border border-slate-200 p-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-mono-tech text-xs text-slate-500 uppercase tracking-wider">Work Order</div>
                  <div className="font-display text-2xl font-bold mt-1">{data.work_order.code}</div>
                </div>
                <Badge className="rounded-sm border bg-red-50 text-red-700 border-red-200 uppercase tracking-wider text-xs">{data.work_order.status}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 text-sm">
                <Info label="Product" v={data.work_order.product} />
                <Info label="Quantity" v={data.work_order.qty} />
                <Info label="Customer" v={data.work_order.customer_name || "—"} />
                <Info label="Priority" v={data.work_order.priority} />
                <Info label="PO Reference" v={data.work_order.po_ref || "—"} />
                <Info label="Start" v={fmt(data.work_order.start_date)} />
                <Info label="Due" v={fmt(data.work_order.due_date)} />
                <Info label="Progress" v={`${data.work_order.progress || 0}%`} />
              </div>
              <div className="mt-6 h-2 bg-slate-100 overflow-hidden">
                <div className="h-full bg-red-600" style={{ width: `${data.work_order.progress || 0}%` }} />
              </div>
            </div>

            <div className="border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                <div className="font-display font-semibold">Job cards ({data.job_cards.length})</div>
              </div>
              {data.job_cards.length === 0 ? (
                <div className="px-6 py-8 text-sm text-slate-500">No job cards yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.job_cards.map(j => (
                    <div key={j.id} className="px-6 py-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                      <div className="font-mono-tech text-xs text-slate-500">{j.code}</div>
                      <div>{j.operation}</div>
                      <div className="text-slate-500">{j.machine || "—"}</div>
                      <div className="font-mono-tech text-xs">{j.qty_done}/{j.qty_planned}</div>
                      <div><Badge variant="outline" className="rounded-sm text-xs uppercase">{j.status}</Badge></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
                <div className="font-display font-semibold">QC reports ({data.qc_reports.length})</div>
              </div>
              {data.qc_reports.length === 0 ? (
                <div className="px-6 py-8 text-sm text-slate-500">No QC reports yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.qc_reports.map(q => (
                    <div key={q.id} className="px-6 py-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                      <div className="font-mono-tech text-xs text-slate-500">{q.code}</div>
                      <div>{q.parameter}</div>
                      <div className="text-slate-500">{q.spec}</div>
                      <div>{q.measured}</div>
                      <div>
                        <Badge className={`rounded-sm text-xs uppercase ${q.result==='pass'?'bg-emerald-50 text-emerald-700 border-emerald-200':q.result==='fail'?'bg-red-50 text-red-700 border-red-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>{q.result}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Info = ({ label, v }) => (
  <div>
    <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
    <div className="mt-1 text-slate-900">{v ?? "—"}</div>
  </div>
);

function fmt(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}
