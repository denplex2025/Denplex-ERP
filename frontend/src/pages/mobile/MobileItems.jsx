import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { inr } from "@/lib/mobileData";
import { Search, Store, PackageSearch, Settings2, ChevronRight, PackagePlus, Share2 } from "lucide-react";

const QUICK_LINKS = [
  { label: "Online Store", icon: Store, to: "/app/inventory" },
  { label: "Stock Summary", icon: PackageSearch, to: "/app/inventory" },
  { label: "Item Settings", icon: Settings2, to: "/app/settings" },
];

export default function MobileItems() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    api.get("/inventory/items", { silent: true })
      .then((r) => { if (alive) setItems(Array.isArray(r.data) ? r.data : []); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter((it) => (it.name || "").toLowerCase().includes(s) || (it.sku || "").toLowerCase().includes(s));
  }, [items, q]);

  return (
    <div className="px-3 pt-3">
      <div className="bg-white rounded-xl p-3 mb-3 border border-slate-200">
        <div className="text-xs font-semibold text-slate-500 mb-2.5">Quick Links</div>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_LINKS.map((l) => (
            <button key={l.label} onClick={() => nav(l.to)} className="flex flex-col items-center gap-1.5 active:opacity-70">
              <div className="h-11 w-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><l.icon className="h-5 w-5" /></div>
              <span className="text-[10px] text-slate-600 text-center leading-tight">{l.label}</span>
            </button>
          ))}
          <button onClick={() => nav("/app/inventory")} className="flex flex-col items-center gap-1.5 active:opacity-70">
            <div className="h-11 w-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><ChevronRight className="h-5 w-5" /></div>
            <span className="text-[10px] text-slate-600 text-center leading-tight">Show All</span>
          </button>
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search for an item or code"
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-red-400"
        />
      </div>

      {loading && <div className="text-center text-sm text-slate-400 py-10">Loading…</div>}

      {!loading && (
        <div className="space-y-2.5">
          {filtered.length === 0 && <div className="text-center text-sm text-slate-400 py-10">No items yet.</div>}
          {filtered.slice(0, 100).map((it) => (
            <div key={it.id} className="bg-white rounded-xl p-3.5 border border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-semibold text-slate-900 text-sm truncate">{it.name || it.sku}</div>
                <button className="text-slate-400 flex-shrink-0"><Share2 className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
                <div><div className="text-[10px] text-slate-400 uppercase">Sale Price</div><div className="font-semibold text-sm">{inr(it.sale_price)}</div></div>
                <div><div className="text-[10px] text-slate-400 uppercase">Purchase Price</div><div className="font-semibold text-sm">{inr(it.purchase_price)}</div></div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">In Stock</div>
                  <div className={`font-semibold text-sm ${Number(it.qty_on_hand || 0) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {Number(it.qty_on_hand || 0).toLocaleString("en-IN")} {it.uom || ""}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => nav("/app/inventory")}
        className="fixed bottom-20 right-4 z-20 bg-red-600 text-white rounded-full pl-4 pr-5 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 active:bg-red-700"
      >
        <PackagePlus className="h-4 w-4" /> Add New Item
      </button>
    </div>
  );
}
