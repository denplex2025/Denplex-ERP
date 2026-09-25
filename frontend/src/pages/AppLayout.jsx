import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Toaster } from "sonner";
import {
  LayoutDashboard, Boxes, Layers, ClipboardList, FileText,
  ShoppingCart, Users, UserPlus, Truck, ShieldCheck,
  FileBox, Settings as SettingsIcon, LogOut, Menu, Calculator, UsersRound, Megaphone, Wrench, ScrollText,
  ArrowDownToLine, ArrowUpFromLine, Banknote, Undo2, Cog, CalendarRange, Search, Trash2, SlidersHorizontal, AlarmClock, Webhook, Library, Landmark, Wallet, Sparkles, BookOpen,
  ClipboardCheck, Gavel, PackageCheck, BarChart3, ChevronLeft, ChevronRight
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import api from "@/lib/api";
import GlobalSpinner from "@/components/erp/GlobalSpinner";
import FloatingActions from "@/components/erp/FloatingActions";
import Aria from "@/components/erp/Aria";
import { ReceiptIcon, hydrateCurrency } from "@/lib/currency";

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
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No matches for "{q}"</div>}
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
    // Full order-to-cash flow lives here now: every document a salesperson creates against a
    // customer, from first quote through to the invoice and the payment received for it.
    // Previously Sale Invoices/New Sale Invoice/Credit Notes were mis-filed under Accounts —
    // moved here (2026-08-19) so a "sales"-only user sees their own invoices on desktop the same
    // way they already do on mobile (MobileMenu.jsx's "My Business" group used moduleKey "sales"
    // for Sale Invoices all along; desktop was the odd one out).
    head: "Sales",
    moduleKey: "sales",
    roles: ["manager", "sales"],
    items: [
      { to: "/app/leads", label: "Leads", icon: UserPlus, testid: "nav-leads" },
      { to: "/app/customers", label: "Customers", icon: Users, testid: "nav-customers" },
      { to: "/app/quotations", label: "Estimate / Quotation", icon: FileText, testid: "nav-quotations" },
      { to: "/app/proforma", label: "Proforma Invoice", icon: FileText, testid: "nav-proforma" },
      { to: "/app/docs/sale-orders", label: "Sale Orders", icon: FileText, testid: "nav-sale-orders" },
      { to: "/app/sale-orders/new", label: "New Sale Order", icon: FileText, testid: "nav-so-new", end: true },
      { to: "/app/docs/delivery-challans", label: "Delivery Challans", icon: Truck, testid: "nav-delivery-challans" },
      { to: "/app/invoices", label: "Sale Invoices", icon: ReceiptIcon, testid: "nav-invoices" },
      { to: "/app/invoices/new", label: "New Sale Invoice", icon: ReceiptIcon, testid: "nav-invoice-new", end: true },
      { to: "/app/docs/credit-notes", label: "Credit Notes", icon: ReceiptIcon, testid: "nav-credit-notes" },
      { to: "/app/sale-returns", label: "Sale Returns", icon: Undo2, testid: "nav-sale-returns" },
      { to: "/app/payments-in", label: "Payment-In", icon: ArrowDownToLine, testid: "nav-payments-in" },
    ],
  },
  {
    // Backoffice bookkeeping/finance only — the sales documents themselves (invoices, credit
    // notes) now live in Sales above; this group is reports, ledgers, and money-in-the-bank.
    head: "Accounts",
    moduleKey: "accounts",
    roles: ["manager", "accountant", "ca"],
    items: [
      { to: "/app/accounting", label: "Accounting", icon: Calculator, testid: "nav-accounting" },
      { to: "/app/gst-reports", label: "GST Reports", icon: Landmark, testid: "nav-gst-reports" },
      { to: "/app/financial-statements", label: "Accounting Books (P&L / BS)", icon: BookOpen, testid: "nav-financials" },
      { to: "/app/bank-cash", label: "Cash & Bank", icon: Wallet, testid: "nav-bank-cash" },
      { to: "/app/statements", label: "Account Statements", icon: ScrollText, testid: "nav-statements" },
      { to: "/app/reminders", label: "Payment Reminders", icon: AlarmClock, testid: "nav-reminders" },
      { to: "/app/costing", label: "Costing & Profitability", icon: Calculator, testid: "nav-costing" },
    ],
  },
  {
    head: "Production",
    moduleKey: "production",
    roles: ["manager", "production", "design"],
    items: [
      { to: "/app/parts", label: "Part Master", icon: Cog, testid: "nav-parts" },
      { to: "/app/part-library", label: "Parts Library", icon: Library, testid: "nav-part-library" },
      { to: "/app/fixture-concept", label: "AI Fixture Concept", icon: Wrench, testid: "nav-fixture-concept" },
      { to: "/app/cad-viewer", label: "3D CAD Viewer", icon: FileBox, testid: "nav-cad-viewer" },
      { to: "/app/machining-quote", label: "Machining Quote", icon: Calculator, testid: "nav-machining-quote" },
      { to: "/app/bom", label: "BOM", icon: Layers, testid: "nav-bom" },
      { to: "/app/work-orders", label: "Work Orders", icon: ClipboardList, testid: "nav-work-orders" },
      { to: "/app/machines", label: "Machines", icon: Cog, testid: "nav-machines" },
      { to: "/app/planning", label: "Planning & Schedule", icon: CalendarRange, testid: "nav-planning" },
      { to: "/app/job-cards", label: "Job Cards", icon: FileText, testid: "nav-job-cards" },
      { to: "/app/docs/job-work-out", label: "Job Work Out", icon: Wrench, testid: "nav-job-work-out" },
      { to: "/app/inventory", label: "Inventory", icon: Boxes, testid: "nav-inventory" },
      { to: "/app/bulk-items", label: "Bulk Item Update", icon: SlidersHorizontal, testid: "nav-bulk-items" },
    ],
  },
  {
    head: "Procurement",
    moduleKey: "procurement",
    roles: ["manager", "accountant", "ca", "production"],
    items: [
      { to: "/app/procurement/requisitions", label: "Purchase Requisition", icon: ClipboardCheck, testid: "nav-purchase-requisition" },
      { to: "/app/suppliers", label: "Vendor & Supplier Management", icon: Truck, testid: "nav-suppliers" },
      { to: "/app/procurement/sourcing", label: "Sourcing & Tendering", icon: Gavel, testid: "nav-sourcing-tendering" },
      { to: "/app/purchase-orders", label: "Purchase Order (PO) Management", icon: ShoppingCart, testid: "nav-purchase-orders" },
      { to: "/app/purchase-orders/new", label: "New Purchase Order", icon: ShoppingCart, testid: "nav-po-new", end: true },
      { to: "/app/procurement/goods-receipt", label: "Goods Receipt", icon: PackageCheck, testid: "nav-goods-receipt" },
      { to: "/app/purchase-bills", label: "Invoice Automation & Payment", icon: ReceiptIcon, testid: "nav-vendor-bills" },
      { to: "/app/purchase-bills/new", label: "New Purchase Bill", icon: ReceiptIcon, testid: "nav-pb-new", end: true },
      { to: "/app/payments-out", label: "Payment-Out", icon: ArrowUpFromLine, testid: "nav-payments-out" },
      { to: "/app/procurement/spend-analytics", label: "Inventory & Spend Analytics", icon: BarChart3, testid: "nav-spend-analytics" },
      { to: "/app/purchase-returns", label: "Purchase Returns", icon: Undo2, testid: "nav-purchase-returns" },
      { to: "/app/expenses", label: "Expenses", icon: Banknote, testid: "nav-expenses" },
    ],
  },
  {
    head: "Quality",
    moduleKey: "quality",
    roles: ["manager", "qc", "production"],
    items: [
      { to: "/app/qc", label: "QC Reports", icon: ShieldCheck, testid: "nav-qc" },
      { to: "/app/documents", label: "Documents (ISO)", icon: FileBox, testid: "nav-documents" },
      { to: "/app/iso", label: "ISO QMS", icon: ShieldCheck, testid: "nav-iso" },
    ],
  },
  {
    head: "Marketing",
    moduleKey: "marketing",
    roles: ["manager", "sales"],
    items: [
      { to: "/app/marketing", label: "Marketing", icon: Megaphone, testid: "nav-marketing" },
    ],
  },
  {
    head: "HR",
    moduleKey: "hr",
    roles: ["manager"],
    items: [
      { to: "/app/hr", label: "HR", icon: UsersRound, testid: "nav-hr" },
    ],
  },
  {
    head: "Administration",
    moduleKey: "administration",
    adminOnly: true,
    items: [
      { to: "/app/users", label: "Users", icon: SettingsIcon, testid: "nav-users" },
      { to: "/app/settings", label: "Settings", icon: Wrench, testid: "nav-settings" },
      { to: "/app/doc-masters", label: "Document Masters", icon: FileText, testid: "nav-doc-masters" },
      { to: "/app/audit", label: "Audit Log", icon: ScrollText, testid: "nav-audit" },
      { to: "/app/recycle-bin", label: "Recycle Bin", icon: Trash2, testid: "nav-recycle-bin" },
      { to: "/app/reset-data", label: "Reset Trial Data", icon: Trash2, testid: "nav-reset-data" },
      { to: "/app/webhooks", label: "Integrations / Webhooks", icon: Webhook, testid: "nav-webhooks" },
    ],
  },
];

// --- Sidebar sizing -----------------------------------------------------------------------
// The sidebar is drag-resizable, and the width is a real number rather than an open/closed
// boolean so the content area can reclaim exactly what the sidebar gives up. Below RAIL_SNAP the
// labels are dropped and it becomes an icon rail — that threshold is where the longest nav label
// stops fitting, so there is no in-between state with text cut off mid-word.
const RAIL_MIN = 64;    // icon rail
const RAIL_SNAP = 150;  // below this, labels are hidden
const RAIL_MAX = 380;
const RAIL_DEFAULT = 256;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(() => { try { return parseFloat(localStorage.getItem("erp_zoom")) || 1; } catch (e) { return 1; } });
  useEffect(() => { try { document.documentElement.style.zoom = String(zoom); localStorage.setItem("erp_zoom", String(zoom)); } catch (e) {} }, [zoom]);
  const setZ = (z) => setZoom(Math.min(1.5, Math.max(0.7, Math.round(z * 100) / 100)));

  const [railW, setRailW] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem("erp_rail_w"), 10);
      return Number.isFinite(v) ? Math.min(RAIL_MAX, Math.max(RAIL_MIN, v)) : RAIL_DEFAULT;
    } catch (e) { return RAIL_DEFAULT; }
  });
  const [dragging, setDragging] = useState(false);
  const rail = railW < RAIL_SNAP;   // icon-only mode
  useEffect(() => { try { localStorage.setItem("erp_rail_w", String(railW)); } catch (e) {} }, [railW]);

  // Drag on window rather than the handle, so the pointer can leave the 4px strip mid-drag
  // without the resize stopping — the usual reason a splitter feels sticky.
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      setRailW(Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(x))));
    };
    const stop = () => setDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", stop);
    // Stops the cursor flickering to a text caret over every label while dragging.
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", stop);
      document.body.style.userSelect = prev;
      document.body.style.cursor = "";
    };
  }, [dragging]);

  // --- Density -----------------------------------------------------------------------------
  // "Fit first, scroll last." Pages read these variables instead of hard-coding sizes, so as the
  // content area narrows the padding and gaps give way BEFORE the text does, and the text stops
  // shrinking at a floor that is still readable (11px). Past that point nothing can give, and the
  // page scrolls — which is the intended behaviour, not a failure.
  //
  // Driven off the real available width (viewport minus the sidebar) rather than a CSS media
  // query, because dragging the sidebar changes the space without changing the viewport at all.
  const applyDensity = useCallback((w) => {
    const avail = Math.max(320, (typeof window !== "undefined" ? window.innerWidth : 1440) - w);
    const t = Math.min(1, Math.max(0, (avail - 900) / 700));   // 0 at 900px, 1 at 1600px
    const lerp = (a, b) => (a + (b - a) * t);
    const r = document.documentElement.style;
    r.setProperty("--erp-fs", `${lerp(11, 14).toFixed(2)}px`);        // table/body text
    r.setProperty("--erp-fs-sm", `${lerp(10, 12).toFixed(2)}px`);     // labels, captions
    r.setProperty("--erp-cell-x", `${lerp(4, 12).toFixed(2)}px`);     // cell padding, horizontal
    r.setProperty("--erp-cell-y", `${lerp(3, 8).toFixed(2)}px`);      // cell padding, vertical
    r.setProperty("--erp-gap", `${lerp(6, 16).toFixed(2)}px`);        // grid gaps
    r.setProperty("--erp-pad", `${lerp(12, 32).toFixed(2)}px`);       // page padding
    r.setProperty("--erp-avail", `${avail}px`);
  }, []);

  useEffect(() => {
    api.get("/masters").then(r => hydrateCurrency(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    applyDensity(railW);
    const onResize = () => applyDensity(railW);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [railW, applyDensity]);

  if (!user) {
    nav("/login");
    return null;
  }

  const _role = user.role || "admin";
  // Per-user module_access (set by an admin in Users & Permissions) overrides the role-based
  // default when present — same mechanism and same module keys as the mobile menu
  // (MobileMenu.jsx), so one toggle controls a user's access on both surfaces. Admin always sees
  // everything regardless, so an override can never lock the admin account itself out.
  const _overrides = user.module_access || {};
  const visibleGroups = NAV_GROUPS.filter(g => {
    if (_role === "admin") return true;       // admin sees everything
    if (g.moduleKey && Object.prototype.hasOwnProperty.call(_overrides, g.moduleKey)) {
      return _overrides[g.moduleKey] === true;
    }
    if (g.adminOnly) return false;            // admin-only groups hidden from others
    if (_role === "trial") return true;       // trial evaluates the full product
    if (!g.roles) return true;                // ungated groups (e.g. Dashboard) visible to all
    return g.roles.includes(_role);           // department groups gated by role
  });

  const handleLogout = () => { logout(); nav("/"); };

  return (
    <div className="min-h-screen flex bg-slate-50" data-testid="app-shell">
      <aside
        style={{ width: railW }}
        className={`rail ${open ? "block" : "hidden"} lg:block fixed lg:sticky top-0 z-40 h-screen flex-shrink-0 ${dragging ? "" : "transition-[width] duration-150"}`}
        data-rail={rail ? "icons" : "full"}
      >
        <div className={`rail-edge h-16 flex items-center border-b ${rail ? "justify-center px-0" : "px-5"}`}>
          <Link to="/app" className="flex items-center gap-2.5 min-w-0" title="Denplex ERP">
            <img src="/denplex-logo.png" alt="Denplex" className="h-8 w-8 object-contain shrink-0 bg-white rounded-sm p-0.5" />
            {!rail && <span className="font-display font-bold tracking-tight text-white truncate">DENPLEX ERP</span>}
          </Link>
        </div>
        <nav className={`overflow-y-auto overflow-x-hidden h-[calc(100vh-4rem-5rem)] ${rail ? "p-2" : "p-3"}`}>
          {visibleGroups.map((group, gi) => (
            <div key={group.head || `group-${gi}`} className={gi > 0 ? "mt-4" : ""}>
              {group.head && (
                rail
                  // In rail mode a heading would just be clipped text, so it becomes a divider —
                  // the grouping is still legible, without pretending the label fits.
                  ? <div className="rail-divider mx-2 mb-1" />
                  : <div className="rail-head px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider truncate">{group.head}</div>
              )}
              <div className="space-y-0.5">
                {group.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    onClick={() => setOpen(false)}
                    data-testid={n.testid}
                    title={n.label}
                    className={({ isActive }) =>
                      `rail-item ${isActive ? "is-active" : ""} flex items-center gap-2.5 py-2 text-sm rounded-sm transition-colors duration-150 ${rail ? "justify-center px-0" : "px-3"}`
                    }
                  >
                    <n.icon className={`${rail ? "h-5 w-5" : "h-[18px] w-[18px]"} shrink-0`} strokeWidth={2.1} />
                    {!rail && <span className="truncate">{n.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className={`rail-foot absolute bottom-0 left-0 right-0 ${rail ? "p-2" : "p-3"}`}>
          <Link
            to="/app/profile"
            onClick={() => setOpen(false)}
            className={`rail-item block rounded-sm ${rail ? "px-0 py-2 text-center" : "px-2 py-1"}`}
            data-testid="nav-profile"
            title={`${user.name} · ${user.role}`}
          >
            {rail ? (
              <div className="mx-auto h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center" style={{ background: "var(--erp-rail-bg-dark)", color: "#fff" }}>
                {String(user.name || "?").trim().charAt(0).toUpperCase()}
              </div>
            ) : (
              <>
                <div className="rail-head text-xs uppercase tracking-wider">Signed in</div>
                <div className="text-sm font-medium text-white truncate">{user.name}</div>
                <div className="rail-head text-xs uppercase tracking-wider mt-0.5">{user.role}</div>
              </>
            )}
          </Link>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className={`rail-item w-full rounded-sm mt-2 ${rail ? "justify-center px-0" : "justify-start"}`}
            data-testid="logout-button"
            title="Sign out"
          >
            <LogOut className="h-4 w-4 shrink-0" />{!rail && <span className="ml-2">Sign out</span>}
          </Button>
        </div>

        {/* Drag handle. Sits just outside the sidebar's right edge so it is grabbable without
            overlapping the nav items. Double-click toggles between icon rail and default width —
            the same gesture people already expect from a splitter. */}
        <div
          onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
          onTouchStart={() => setDragging(true)}
          onDoubleClick={() => setRailW(rail ? RAIL_DEFAULT : RAIL_MIN)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize · double-click to collapse"
          data-testid="sidebar-resize"
          className="hidden lg:block absolute top-0 right-0 h-full w-1.5 translate-x-1/2 cursor-col-resize z-50 group"
        >
          <div className={`rail-grip h-full w-full transition-colors ${dragging ? "is-dragging" : ""}`} />
        </div>
        <button
          onClick={() => setRailW(rail ? RAIL_DEFAULT : RAIL_MIN)}
          title={rail ? "Expand sidebar" : "Collapse sidebar"}
          data-testid="sidebar-toggle"
          className="rail-btn hidden lg:flex absolute top-[68px] -right-3 z-50 h-6 w-6 items-center justify-center rounded-full shadow"
        >
          {rail ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
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
          <div className="ml-auto inline-flex items-center gap-1 text-xs" title="Zoom the whole app (pages & dialogs)">
            <button onClick={() => setZ(zoom - 0.1)} className="px-2 py-1 rounded-sm border border-slate-200 hover:bg-slate-50 font-semibold">A−</button>
            <button onClick={() => setZ(1)} className="px-2 py-1 rounded-sm border border-slate-200 hover:bg-slate-50 tabular-nums w-12 text-slate-600">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZ(zoom + 0.1)} className="px-2 py-1 rounded-sm border border-slate-200 hover:bg-slate-50 font-semibold">A+</button>
          </div>
        </div>
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4 gap-3">
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle"><Menu className="h-5 w-5" /></Button>
          <div className="flex-1"><GlobalSearch /></div>
          <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="h-5 w-5" /></Button>
        </div>
        {/* No max-width. The 1500px cap meant collapsing the sidebar bought nothing on a wide
            screen — the freed space just became margin. Padding now comes from the density
            scale, so it tightens as the window narrows instead of holding 32px either side of a
            table that no longer fits. */}
        <div style={{ padding: "var(--erp-pad, 24px)" }}>
          <Outlet />
        </div>
      </main>
      <GlobalSpinner />
      <FloatingActions />
      <Aria />
      <Toaster position="top-right" richColors />
    </div>
  );
}
