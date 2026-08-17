import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { loadMobileFinancials, inr } from "@/lib/mobileData";
import { canSeeMoney, MASKED_AMOUNT } from "@/lib/roleAccess";
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";

export default function MobileDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const showMoney = canSeeMoney(user);
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadMobileFinancials().then((r) => { if (alive) setD(r); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading || !d) return <div className="text-center text-sm text-slate-400 py-16">Loading dashboard…</div>;

  const pctChange = (() => {
    const t = d.trend;
    if (!t || t.length < 2) return null;
    const prev = t[t.length - 2].amount, cur = t[t.length - 1].amount;
    if (!prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
  })();

  return (
    <div className="px-3 pt-3 space-y-3">
      {/* You'll Get / You'll Give — amounts only for admin/accountant/ca */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="You'll Get" value={showMoney ? inr(d.receivableTotal) : MASKED_AMOUNT} icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} onClick={() => nav("/app/payments-in")} />
        <Tile label="You'll Give" value={showMoney ? inr(d.payableTotal) : MASKED_AMOUNT} icon={<TrendingDown className="h-4 w-4 text-red-600" />} onClick={() => nav("/app/payments-out")} tone="red" />
      </div>

      {/* Sale overview — purely financial (trend chart, purchases/expenses totals), hidden outright
          for roles that shouldn't see revenue figures rather than shown with masked numbers. */}
      {showMoney && (
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="text-sm font-semibold text-slate-700 mb-1">Your Sale Overview ({d.trend?.[d.trend.length - 1]?.month})</div>
          <div className="text-center">
            <div className="text-xs text-slate-400">Total Sale</div>
            <div className="text-2xl font-bold text-slate-900">{inr(d.monthSales)}</div>
            {pctChange !== null && (
              <div className={`text-xs mt-0.5 inline-flex items-center gap-1 ${pctChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {pctChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(pctChange)}% {pctChange >= 0 ? "growth" : "decline"} vs last month
              </div>
            )}
          </div>
          <div className="h-28 mt-2 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.trend}>
                <defs>
                  <linearGradient id="mSalesG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" fontSize={10} stroke="#94a3b8" axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => inr(v)} />
                <Area type="monotone" dataKey="amount" stroke="#dc2626" strokeWidth={2} fill="url(#mSalesG)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-1 pt-3 border-t border-slate-100">
            <div><div className="text-[10px] text-slate-400 uppercase">Purchases (this month)</div><div className="font-semibold text-sm">{inr(d.monthPurchases)}</div></div>
            <div><div className="text-[10px] text-slate-400 uppercase">Expenses (this month)</div><div className="font-semibold text-sm">{inr(d.monthExpenses)}</div></div>
          </div>
        </div>
      )}

      {/* Stock — item counts stay visible to everyone (production/QC need this); stock valuation
          (₹) is a financial figure and stays masked for non-finance roles. */}
      <div className="bg-white rounded-xl p-4 border border-slate-200" onClick={() => nav("/m/items")}>
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-[10px] text-slate-400 uppercase">Stock Value</div><div className="font-bold text-emerald-600">{showMoney ? inr(d.stockValue) : MASKED_AMOUNT}</div></div>
          <div><div className="text-[10px] text-slate-400 uppercase">No. of Items</div><div className="font-bold text-slate-900">{d.items.length}</div></div>
        </div>
        {d.lowStock.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
              <span>Low Stock Items ({d.lowStock.length})</span>
            </div>
            {d.lowStock.slice(0, 3).map((it, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-600 truncate mr-2">{it.name}</span>
                <span className="text-red-500 font-medium flex-shrink-0">{it.shortfall}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Sale Transactions — counts stay visible to everyone; ₹ balance masked for non-finance roles */}
      <Section title="Open Sale Transactions">
        <Row label="Open Sale Orders" count={d.openInvoices.length} amount={sumOf(d.openInvoices, "balance")} showMoney={showMoney} onClick={() => nav("/app/invoices")} />
      </Section>

      {/* Open Purchase Transactions */}
      <Section title="Open Purchase Transactions">
        <Row label="Open Purchase Orders" count={d.openBills.length} amount={sumOf(d.openBills, "balance")} showMoney={showMoney} tone="red" onClick={() => nav("/app/purchase-bills")} />
      </Section>

      {/* Open Cheques */}
      {(d.receivedCheques.length > 0 || d.paidCheques.length > 0) && (
        <Section title="Open Cheques">
          <Row label="Received Cheques" count={d.receivedCheques.length} amount={sumOf(d.receivedCheques, "amount")} showMoney={showMoney} onClick={() => nav("/app/bank-cash")} />
          <Row label="Paid Cheques" count={d.paidCheques.length} amount={sumOf(d.paidCheques, "amount")} showMoney={showMoney} tone="red" onClick={() => nav("/app/bank-cash")} />
        </Section>
      )}

      {/* Expenses — purely financial line items, hidden outright for non-finance roles */}
      {showMoney && d.expenseBreakdown.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-slate-200 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700">Expenses</div>
            <button onClick={() => nav("/app/expenses")} className="text-xs text-red-600 font-medium">See All</button>
          </div>
          {d.expenseBreakdown.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
              <span className="text-slate-600">{e.name}</span>
              <span className="font-semibold text-red-600">{inr(e.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, icon, tone, onClick }) {
  return (
    <button onClick={onClick} className="bg-white rounded-xl p-3.5 border border-slate-200 text-left">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">{icon}{label}</div>
      <div className={`font-bold text-lg mt-1 ${tone === "red" ? "text-red-600" : "text-emerald-600"}`}>{value}</div>
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className="text-sm font-semibold text-slate-700 mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, count, amount, tone, showMoney = true, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 text-left">
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-semibold text-sm text-slate-900">{count}</div>
      </div>
      <div className={`font-semibold text-sm ${tone === "red" ? "text-red-600" : "text-emerald-600"}`}>{showMoney ? inr(amount) : MASKED_AMOUNT}</div>
    </button>
  );
}

function sumOf(arr, key) {
  return arr.reduce((a, b) => a + (Number(b[key]) || 0), 0);
}
