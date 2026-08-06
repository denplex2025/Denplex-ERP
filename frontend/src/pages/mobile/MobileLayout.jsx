import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { COMPANY_FULL } from "@/lib/brand";
import { Home, LayoutGrid, Package, Menu as MenuIcon, Bell, Settings as SettingsIcon } from "lucide-react";

// Mobile-first shell for the Koshix app: sticky top bar + bottom tab nav.
// Kept as a separate route tree (mounted at /m) from the desktop AppLayout so it can be
// designed purpose-built for small screens rather than a responsive squeeze of the desktop UI.
const TABS = [
  { to: "/m", label: "Home", icon: Home, end: true },
  { to: "/m/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/m/items", label: "Items", icon: Package },
  { to: "/m/menu", label: "Menu", icon: MenuIcon },
];

export default function MobileLayout() {
  const { user } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-[#eaf2fb] flex flex-col">
      <header className="sticky top-0 z-30 bg-white px-3 h-14 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/denplex-logo.png" alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
          <div className="font-display font-bold text-slate-900 text-[15px] truncate">{COMPANY_FULL}</div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 ml-2">
          <button aria-label="Notifications" className="text-slate-500 active:text-slate-700">
            <Bell className="h-5 w-5" />
          </button>
          <button aria-label="Settings" onClick={() => nav("/app/settings")} className="text-slate-500 active:text-slate-700">
            <SettingsIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 pb-24 w-full max-w-xl mx-auto">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 grid grid-cols-4 z-30 max-w-xl mx-auto">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2.5 text-[11px] font-medium ${isActive ? "text-red-600" : "text-slate-500"}`
            }
          >
            <t.icon className="h-5 w-5 mb-0.5" />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
