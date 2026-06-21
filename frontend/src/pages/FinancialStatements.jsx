import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, Download, FileText } from "lucide-react";
import { toast } from "sonner";

const inr = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fyDefault() {
  const t = new Date();
  const y = t.getMonth() + 1 >= 4 ? t.getFullYear() : t.getFullYear() - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

export default function FinancialStatements() {
  const [tab, setTab] = useState("pnl");
  const [range, setRange] = useState(fyDefault());
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [pnl, setPnl] = useState(null);
  const [bs, setBs] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadPnl = async () => {
    setLoading(true);
    try { const r = await api.get("/reports/pnl", { params: { date_from: range.from, date_to: range.to } }); setPnl(r.data); }
    catch (e) { toast.error("Could not load P&L"); }
    setLoading(false);
  };
  const loadBs = async () => {
    setLoading(true);
    try { const r = await api.get("/reports/balance-sheet", { params: { as_of: asOf } }); setBs(r.data); }
    catch (e) { toast.error("Could not load Balance Sheet"); }
    setLoading(false);
  };
  useEffect(() => { loadPnl(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (tab === "bs" && !bs) loadBs(); /* eslint-disable-next-line */ }, [tab]);

  const dl = async (kind, fmt) => {
    try {
      const url = kind === "pnl" ? "/reports/pnl/export" : "/reports/balance-sheet/export";
      const params = kind === "pnl" ? { date_from: range.from, date_to: range.to, fmt } : { as_of: asOf, fmt };
      const r = await api.get(url, { params, responseType: "blob" });
      const blob = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = blob; a.download = `${kind === "pnl" ? "P&L" : "BalanceSheet"}.${fmt === "pdf" ? "pdf" : "xlsx"}`; a.click();
      URL.revokeObjectURL(blob);
    } catch (e) { toast.error("Download failed"); }
  };
  const Exports = ({ kind }) => (
    <div className="flex gap-2 ml-auto">
      <Button onClick={() => dl(kind, "xlsx")} variant="outline" className="rounded-sm"><Download className="h-4 w-4 mr-1" /> Excel</Button>
      <Button onClick={() => dl(kind, "pdf")} variant="outline" className="rounded-sm"><FileText className="h-4 w-4 mr-1" /> PDF</Button>
    </div>
  );

  return (
    <div className="pb-10 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">Accounting Books</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">Profit &amp; Loss and Balance Sheet, computed live from your invoices, bills, expenses, payments, stock and bank balances.</p>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {[["pnl", "Profit & Loss"], ["bs", "Balance Sheet"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{l}</button>
        ))}
      </div>

      {tab === "pnl" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4 bg-slate-50 border border-slate-200 rounded-md p-3">
            <div><Label className="text-[11px] uppercase tracking-wider text-slate-500">From</Label><Input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="mt-1 w-40" /></div>
            <div><Label className="text-[11px] uppercase tracking-wider text-slate-500">To</Label><Input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="mt-1 w-40" /></div>
            <Button onClick={loadPnl} disabled={loading} className="rounded-sm bg-red-600 hover:bg-red-700">{loading ? "Loading…" : "Run"}</Button>
            <Exports kind="pnl" />
          </div>
          {pnl && <Pnl d={pnl} />}
        </>
      )}

      {tab === "bs" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4 bg-slate-50 border border-slate-200 rounded-md p-3">
            <div><Label className="text-[11px] uppercase tracking-wider text-slate-500">As of</Label><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="mt-1 w-40" /></div>
            <Button onClick={loadBs} disabled={loading} className="rounded-sm bg-red-600 hover:bg-red-700">{loading ? "Loading…" : "Run"}</Button>
            <Exports kind="bs" />
          </div>
          {bs && <Bs d={bs} />}
        </>
      )}
    </div>
  );
}

const Row = ({ label, val, bold, indent, neg }) => (
  <div className={`flex justify-between py-1.5 ${bold ? "font-semibold border-t border-slate-200" : ""} ${indent ? "pl-4 text-slate-600" : ""}`}>
    <span>{label}</span>
    <span className={`font-mono-tech ${neg ? "text-slate-500" : ""}`}>{neg ? `(${inr(val)})` : inr(val)}</span>
  </div>
);

function Pnl({ d }) {
  return (
    <div className="border border-slate-200 rounded-md p-4 text-sm">
      <Row label="Sales (net of returns)" val={d.sales} />
      {d.sales_returns ? <Row label="— Sales returns" val={d.sales_returns} indent neg /> : null}
      <Row label="Less: Purchases (net)" val={d.purchases} neg />
      {d.direct_expenses ? <Row label="Less: Direct expenses" val={d.direct_expenses} neg /> : null}
      <Row label="Gross Profit" val={d.gross_profit} bold />
      <div className="mt-2 mb-1 text-[11px] uppercase tracking-wider text-slate-400">Indirect / operating expenses</div>
      {d.expenses_by_category.length === 0 && <div className="text-slate-400 text-xs pl-4 py-1">No expenses recorded.</div>}
      {d.expenses_by_category.map((e, i) => <Row key={i} label={e.category} val={e.amount} indent neg />)}
      <Row label="Total indirect expenses" val={d.indirect_expenses} neg />
      <Row label="Net Profit" val={d.net_profit} bold />
      <div className="text-[11px] text-slate-400 mt-3">Revenue & purchases are net of GST. Computed from posted documents in the period.</div>
    </div>
  );
}

function Bs({ d }) {
  const a = d.assets, l = d.liabilities, eq = d.equity;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div className="border border-slate-200 rounded-md p-4">
        <div className="font-semibold text-slate-700 mb-2">Assets</div>
        <Row label="Cash & Bank" val={a.cash_bank} />
        {(a.accounts || []).map((x, i) => <Row key={i} label={x.name} val={x.balance} indent />)}
        <Row label="Accounts Receivable" val={a.receivable} />
        <Row label="Inventory (stock value)" val={a.inventory} />
        {a.tds_receivable ? <Row label="TDS Receivable" val={a.tds_receivable} /> : null}
        {a.gst_credit ? <Row label="GST Credit (ITC)" val={a.gst_credit} /> : null}
        <Row label="Total Assets" val={a.total} bold />
      </div>
      <div className="border border-slate-200 rounded-md p-4">
        <div className="font-semibold text-slate-700 mb-2">Liabilities & Equity</div>
        <Row label="Accounts Payable" val={l.payable} />
        {l.gst_payable ? <Row label="GST Payable" val={l.gst_payable} /> : null}
        {l.tds_payable ? <Row label="TDS Payable" val={l.tds_payable} /> : null}
        <Row label="Total Liabilities" val={l.total} bold />
        <div className="mt-3 font-semibold text-slate-700 mb-1">Equity</div>
        <Row label="Retained Earnings (net profit to date)" val={eq.retained_earnings} indent />
        <Row label="Owner's Capital & Reserves" val={eq.capital_balancing} indent />
        <Row label="Total Equity" val={eq.total} bold />
        <Row label="Total Liabilities & Equity" val={l.total + eq.total} bold />
      </div>
      <div className="md:col-span-2 text-[11px] text-slate-400">As of {d.as_of}. Owner's Capital & Reserves is the balancing figure (enter your opening capital under Cash & Bank / accounts for a precise split). Assets always equal Liabilities + Equity.</div>
    </div>
  );
}
