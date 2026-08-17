import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { loadMobileFinancials, inr } from "@/lib/mobileData";
import { canSeeMoney, MASKED_AMOUNT } from "@/lib/roleAccess";
import {
  Search, FilePlus2, FileBarChart2, SlidersHorizontal, ChevronRight,
  Network, FileText, Settings2, UserPlus,
} from "lucide-react";

const QUICK_LINKS_TXN = [
  { label: "Add Txn", icon: FilePlus2, to: "/app/invoices/new" },
  { label: "Sale Report", icon: FileBarChart2, to: "/app/invoices" },
  { label: "Txn Settings", icon: SlidersHorizontal, to: "/app/settings" },
];
const QUICK_LINKS_PARTY = [
  { label: "Network", icon: Network, to: "/app/customers" },
  { label: "Party Statement", icon: FileText, to: "/app/statements" },
  { label: "Party Settings", icon: Settings2, to: "/app/settings" },
];

export default function MobileHome() {
  const nav = useNavigate();
  const { user } = useAuth();
  const showMoney = canSeeMoney(user);
  const [tab, setTab] = useState("txn"); // txn | party
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadMobileFinancials().then((d) => { if (alive) setData(d); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const transactions = useMemo(() => {
    const list = data?.transactions || [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((t) => (t.party || "").toLowerCase().includes(s) || (t.code || "").toLowerCase().includes(s));
  }, [data, q]);

  const parties = useMemo(() => {
    const list = data?.parties || [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((p) => (p.name || "").toLowerCase().includes(s));
  }, [data, q]);

  const links = tab === "txn" ? QUICK_LINKS_TXN : QUICK_LINKS_PARTY;

  return (
    <div className="px-3 pt-3">
      {/* Tab toggle */}
      <div className="flex gap-2 mb-3 bg-neutral-100 p-1 rounded-lg">
        <button
          onClick={() => setTab("txn")}
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${tab === "txn" ? "bg-red-600 text-white shadow-sm" : "text-neutral-600"}`}
        >
          Transaction Details
        </button>
        <button
          onClick={() => setTab("party")}
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${tab === "party" ? "bg-red-600 text-white shadow-sm" : "text-neutral-600"}`}
        >
          Party Details
        </button>
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-lg p-3 mb-3 border border-neutral-200">
        <div className="text-xs font-semibold text-neutral-500 mb-2.5 uppercase tracking-wide">Quick Links</div>
        <div className="grid grid-cols-4 gap-2">
          {links.map((l) => (
            <button key={l.label} onClick={() => nav(l.to)} className="flex flex-col items-center gap-1.5 active:opacity-70">
              <div className="h-11 w-11 rounded-lg bg-[#171717] text-white flex items-center justify-center"><l.icon className="h-5 w-5" /></div>
              <span className="text-[10px] text-neutral-600 text-center leading-tight">{l.label}</span>
            </button>
          ))}
          <button onClick={() => nav(tab === "txn" ? "/app/invoices" : "/app/customers")} className="flex flex-col items-center gap-1.5 active:opacity-70">
            <div className="h-11 w-11 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center"><ChevronRight className="h-5 w-5" /></div>
            <span className="text-[10px] text-neutral-600 text-center leading-tight">Show All</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "txn" ? "Search for a transaction" : "Search any party"}
          className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
        />
      </div>

      {loading && <div className="text-center text-sm text-neutral-400 py-10">Loading…</div>}

      {!loading && tab === "txn" && (
        <div className="space-y-2.5">
          {transactions.length === 0 && <div className="text-center text-sm text-neutral-400 py-10">No transactions yet.</div>}
          {transactions.slice(0, 40).map((t) => (
            <div key={`${t.kind}-${t.id}`} className="bg-white rounded-lg p-3.5 border border-neutral-200 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-neutral-900 text-sm truncate">{t.party || "—"}</div>
                  <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                    t.color === "emerald" ? "bg-emerald-50 text-emerald-700" : t.color === "amber" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600"
                  }`}>{t.kind.toUpperCase()} · {t.statusLabel}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  {t.code && <div className="text-[11px] text-neutral-400">#{t.code}</div>}
                  <div className="text-[11px] text-neutral-400">{fmtDate(t.date)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-neutral-100">
                <div><div className="text-[10px] text-neutral-400 uppercase">Total</div><div className="font-semibold text-sm">{showMoney ? inr(t.total) : MASKED_AMOUNT}</div></div>
                {t.balance > 0.01 && <div className="text-right"><div className="text-[10px] text-neutral-400 uppercase">Balance</div><div className="font-semibold text-sm text-red-600">{showMoney ? inr(t.balance) : MASKED_AMOUNT}</div></div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "party" && (
        <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 shadow-sm">
          {parties.length === 0 && <div className="text-center text-sm text-neutral-400 py-10">No parties yet.</div>}
          {parties.slice(0, 60).map((p) => (
            <div key={`${p.type}-${p.id}`} className="flex items-center justify-between px-3.5 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-neutral-900 text-sm truncate">{p.name}</div>
                <div className="text-[11px] text-neutral-400">{p.phone || "—"}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`font-semibold text-sm ${p.balance > 0.01 ? "text-emerald-600" : p.balance < -0.01 ? "text-red-600" : "text-neutral-400"}`}>
                  {showMoney ? inr(p.balance) : MASKED_AMOUNT}
                </div>
                <div className="text-[10px] text-neutral-400">{p.balance > 0.01 ? "You'll Get" : p.balance < -0.01 ? "You'll Give" : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => nav(tab === "txn" ? "/app/invoices/new" : "/app/customers")}
        className="fixed bottom-20 right-4 z-20 bg-red-600 text-white rounded-full pl-4 pr-5 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 active:bg-red-700"
      >
        {tab === "txn" ? <FilePlus2 className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {tab === "txn" ? "Add New Sale" : "Add New Party"}
      </button>
    </div>
  );
}

function fmtDate(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return String(s).slice(0, 10); }
}
