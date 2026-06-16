import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Toaster } from "sonner";
import {
  LayoutDashboard, Boxes, Layers, ClipboardList, FileText,
  ShoppingCart, Receipt, Users, UserPlus, Truck, ShieldCheck,
  FileBox, Settings as SettingsIcon, LogOut, Menu, Calculator, UsersRound, Megaphone, Wrench, ScrollText,
  ArrowDownToLine, ArrowUpFromLine, Banknote, Undo2, Cog, CalendarRange, Search
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import GlobalSpinner from "@/components/erp/GlobalSpinner";
import FloatingActions from "@/components/erp/FloatingActions";

function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await api.get(`/search?q=${encodeURIComponent(q.trim())}`); setResults(r.data?.results || []); setOpen(true); }
      catch (e) { /* ignore */ } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const go = (r) => { setOpen(false); setQ(""); setResults([]); nav(r.route); };
  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Search parts, items, customers, invoices…"
        className="w-full h-9 pl-9 pr-3 rounded-sm border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-red-300 focus:outline-none"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-sm shadow-lg max-h-96 overflow-auto">
          {loading && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No matches for “{q}”</div>}
          {results.map((r, i) => (
            <button key={i} onClick={() => go(r)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0">
              <span className="text-[10px] uppercase tracking-wider text-red-600 font-semibold w-24 shrink-0">{r.type}</span>
              <span className="flex-1 truncate"><span className="font-medium">{r.label}</span>{r.sub ? <span className="text-slate-400 ml-2 text-xs">{r.sub}</span> : null}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Grouped sidebar nav. To add a new department head, append a new group object below.
const NAV_GROUPS = [
  {
    head: null,
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
    ],
  },
  {
    head: "Sales",
    items: [
      { to: "/app/leads", label: "Leads", icon: UserPlus, testid: "nav-leads" },
      { to: "/app/customers", label: "Customers", icon: Users, testid: "nav-customers" },
      { to: "/app/quotations", label: "Estimate / Quotation", icon: FileText, testid: "nav-quotations" },
      { to: "/app/proforma", label: "Proforma Invoice", icon: FileText, testid: "nav-proforma" },
      { to: "/app/docs/sale-orders", label: "Sale Orders", icon: FileText, testid: "nav-sale-orders" },
      { to: "/app/docs/delivery-challans", label: "Delivery Challans", icon: Truck, testid: "nav-delivery-challans" },
      { to: "/app/payments-in", label: "Payment-In", icon: ArrowDownToLine, testid: "nav-payments-in" },
      { to: "/app/sale-returns", label: "Sale Returns", icon: Undo2, testid: "nav-sale-returns" },
    ],
  },
  {
    head: "Accounts",
    items: [
      { to: "/app/invoices", label: "Sale Invoices (GST)", icon: Receipt, testid: "nav-invoices" },
      { to: "/app/docs/credit-notes", label: "Credit Notes", icon: Receipt, testid: "nav-credit-notes" },
      { to: "/app/docs/vendor-bills", label: "Purchase Bills", icon: Receipt, testid: "nav-vendor-bills" },
      { to: "/app/accounting", label: "Accounting", icon: Calculator, testid: "nav-accounting" },
      { to: "/app/statements", label: "Account Statements", icon: ScrollText, testid: "nav-statements" },
      { to: "/app/costing", label: "Costing & Profitability", icon: Calculator, testid: "nav-costing" },
    ],
  },
  {
    head: "Production",
    items: [
      { to: "/app/parts", label: "Part Master", icon: Cog, testid: "nav-parts" },
      { to: "/app/bom", label: "BOM", icon: Layers, testid: "nav-bom" },
      { to: "/app/work-orders", label: "Work Orders", icon: ClipboardList, testid: "nav-work-orders" },
      { to: "/app/machines", label: "Machines", icon: Cog, testid: "nav-machines" },
      { to: "/app/planning", label: "Planning & Schedule", icon: CalendarRange, testid: "nav-planning" },
      { to: "/app/job-cards", label: "Job Cards", icon: FileText, testid: "nav-job-cards" },
      { to: "/app/docs/job-work-out", label: "Job Work Out", icon: Wrench, testid: "nav-job-work-out" },
      { to: "/app/inventory", label: "Inventory", icon: Boxes, testid: "nav-inventory" },
    ],
  },
  {
    head: "Purchase & Expense",
    items: [
      { to: "/app/suppliers", label: "Suppliers", icon: Truck, testid: "nav-suppliers" },
      { to: "/app/purchase-orders", label: "Purchase Orders", icon: ShoppingCart, testid: "nav-purchase-orders" },
      { to: "/app/payments-out", label: "Payment-Out", icon: ArrowUpFromLine, testid: "nav-payments-out" },
      { to: "/app/expenses", label: "Expenses", icon: Banknote, testid: "nav-expenses" },
      { to: "/app/purchase-returns", label: "Purchase Returns", icon: Undo2, testid: "nav-purchase-returns" },
    ],
  },
  {
    head: "Quality",
    items: [
      { to: "/app/qc", label: "QC Reports", icon: ShieldCheck, testid: "nav-qc" },
      { to: "/app/documents", label: "Documents (ISO)", icon: FileBox, testid: "nav-documents" },
      { to: "/app/iso", label: "ISO QMS", icon: ShieldCheck, testid: "nav-iso" },
    ],
  },
  {
    head: "Marketing",
    items: [
      { to: "/app/marketing", label: "Marketing", icon: Megaphone, testid: "nav-marketing" },
    ],
  },
  {
    head: "HR",
    items: [
      { to: "/app/hr", label: "HR", icon: UsersRound, testid: "nav-hr" },
    ],
  },
  {
    head: "Administration",
    adminOnly: true,
    items: [
      { to: "/app/users", label: "Users", icon: SettingsIcon, testid: "nav-users" },
      { to: "/app/settings", label: "Settings", icon: Wrench, testid: "nav-settings" },
      { to: "/app/audit", label: "Audit Log", icon: ScrollText, testid: "nav-audit" },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) {
    nav("/login");
    return null;
  }

  const visibleGroups = NAV_GROUPS.filter(g => !g.adminOnly || user.role === "admin");

  const handleLogout = () => { logout(); nav("/"); };

  return (
    <div className="min-h-screen flex bg-slate-50" data-testid="app-shell">
      <aside className={`${open ? "block" : "hidden"} lg:block fixed lg:sticky top-0 z-40 w-64 h-screen bg-white border-r border-slate-200 flex-shrink-0`}>
        <div className="h-16 px-5 flex items-center border-b border-slate-200">
          <Link to="/app" className="flex items-center gap-2.5">
            <img src="/denplex-logo.png" alt="Denplex" className="h-8 w-8 object-contain" />
            <span className="font-display font-bold tracking-tight">DENPLEX ERP</span>
          </Link>
        </div>
        <nav className="p-3 overflow-y-auto h-[calc(100vh-4rem-5rem)]">
          {visibleGroups.map((group, gi) => (
            <div key={group.head || `group-${gi}`} className={gi > 0 ? "mt-4" : ""}>
              {group.head && (
                <div className="px-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {group.head}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    onClick={() => setOpen(false)}
                    data-testid={n.testid}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 text-sm rounded-sm transition-colors ${
                        isActive ? "bg-red-50 text-red-700 font-medium" : "text-slate-700 hover:bg-slate-100"
                      }`
                    }
                  >
                    <n.icon className="h-4 w-4" /> {n.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-200 bg-white">
          <div className="px-2 py-1">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Signed in</div>
            <div className="text-sm font-medium text-slate-900 truncate">{user.name}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{user.role}</div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="w-full justify-start rounded-sm mt-2 text-slate-600" data-testid="logout-button">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        {user.role === "trial" && user.trial_expires_at && (
          <div className="bg-red-600 text-white text-xs px-4 py-2 flex items-center justify-between" data-testid="trial-banner">
            <div>
              <strong>Trial account</strong> — view + create only. Edits and deletions are disabled.
            </div>
            <a href="mailto:admin@denplex.co?subject=Denplex%20ERP%20licence" className="underline">Upgrade →</a>
          </div>
        )}
        <div className="hidden lg:flex sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 h-14 items-center px-6 gap-4">
          <GlobalSearch />
        </div>
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4 gap-3">
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle"><Menu className="h-5 w-5" /></Button>
          <div className="flex-1"><GlobalSearch /></div>
          <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="h-5 w-5" /></Button>
        </div>
        <div className="p-6 lg:p-8 max-w-[1500px]">
          <Outlet />
        </div>
      </main>
      <GlobalSpinner />
      <FloatingActions />
      <Toaster position="top-right" richColors />
    </div>
  );
}
