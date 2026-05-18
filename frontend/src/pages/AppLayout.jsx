import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Toaster } from "sonner";
import {
  LayoutDashboard, Boxes, Layers, ClipboardList, FileText,
  ShoppingCart, Receipt, Users, UserPlus, Truck, ShieldCheck,
  FileBox, Settings as SettingsIcon, LogOut, Cog, Menu, Calculator, UsersRound, Megaphone, Wrench, ScrollText
} from "lucide-react";
import { useState } from "react";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/app/inventory", label: "Inventory", icon: Boxes, testid: "nav-inventory" },
  { to: "/app/bom", label: "BOM", icon: Layers, testid: "nav-bom" },
  { to: "/app/work-orders", label: "Work Orders", icon: ClipboardList, testid: "nav-work-orders" },
  { to: "/app/job-cards", label: "Job Cards", icon: FileText, testid: "nav-job-cards" },
  { to: "/app/quotations", label: "Quotations", icon: FileText, testid: "nav-quotations" },
  { to: "/app/purchase-orders", label: "Purchase Orders", icon: ShoppingCart, testid: "nav-purchase-orders" },
  { to: "/app/invoices", label: "Invoices (GST)", icon: Receipt, testid: "nav-invoices" },
  { to: "/app/accounting", label: "Accounting", icon: Calculator, testid: "nav-accounting" },
  { to: "/app/leads", label: "Leads", icon: UserPlus, testid: "nav-leads" },
  { to: "/app/customers", label: "Customers", icon: Users, testid: "nav-customers" },
  { to: "/app/suppliers", label: "Suppliers", icon: Truck, testid: "nav-suppliers" },
  { to: "/app/qc", label: "QC Reports", icon: ShieldCheck, testid: "nav-qc" },
  { to: "/app/documents", label: "Documents (ISO)", icon: FileBox, testid: "nav-documents" },
  { to: "/app/hr", label: "HR", icon: UsersRound, testid: "nav-hr" },
  { to: "/app/marketing", label: "Marketing", icon: Megaphone, testid: "nav-marketing" },
  { to: "/app/settings", label: "Settings", icon: Wrench, testid: "nav-settings", adminOnly: true },
  { to: "/app/audit", label: "Audit Log", icon: ScrollText, testid: "nav-audit", adminOnly: true },
  { to: "/app/users", label: "Users", icon: SettingsIcon, testid: "nav-users", adminOnly: true },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) {
    nav("/login");
    return null;
  }

  const items = NAV.filter(n => !n.adminOnly || user.role === "admin");

  const handleLogout = () => { logout(); nav("/"); };

  return (
    <div className="min-h-screen flex bg-slate-50" data-testid="app-shell">
      {/* Sidebar */}
      <aside className={`${open ? "block" : "hidden"} lg:block fixed lg:sticky top-0 z-40 w-64 h-screen bg-white border-r border-slate-200 flex-shrink-0`}>
        <div className="h-16 px-5 flex items-center border-b border-slate-200">
          <Link to="/app" className="flex items-center gap-2.5">
            <div className="h-7 w-7 bg-slate-900 flex items-center justify-center">
              <Cog className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold tracking-tight">PRECISION ERP</span>
          </Link>
        </div>
        <nav className="p-3 space-y-0.5 overflow-y-auto h-[calc(100vh-4rem-5rem)]">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              data-testid={n.testid}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-sm rounded-sm transition-colors ${
                  isActive ? "bg-blue-50 text-blue-800 font-medium" : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
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

      {/* Main */}
      <main className="flex-1 min-w-0">
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4">
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle"><Menu className="h-5 w-5" /></Button>
          <div className="font-display font-bold tracking-tight">PRECISION ERP</div>
          <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="h-5 w-5" /></Button>
        </div>
        <div className="p-6 lg:p-8 max-w-[1500px]">
          <Outlet />
        </div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}
