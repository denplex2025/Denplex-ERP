import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Home, Factory, ClipboardCheck, LogOut } from "lucide-react";

const TABS = [
  { to: "/worker", label: "Home", icon: Home, end: true },
  { to: "/worker/production", label: "Production", icon: Factory },
  { to: "/worker/qc", label: "QC", icon: ClipboardCheck },
];

export default function WorkerLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-20 bg-red-600 text-white px-4 h-14 flex items-center justify-between shadow">
        <div className="font-bold font-display">Denplex · Shop Floor</div>
        <button onClick={() => { logout(); nav("/login"); }} aria-label="Logout" className="opacity-90 active:opacity-60"><LogOut className="h-5 w-5" /></button>
      </header>
      <main className="flex-1 p-4 pb-24 max-w-xl w-full mx-auto"><Outlet /></main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 grid grid-cols-3 z-20">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}
            className={({ isActive }) => `flex flex-col items-center justify-center py-2.5 text-[11px] ${isActive ? "text-red-600" : "text-slate-500"}`}>
            <t.icon className="h-5 w-5 mb-0.5" />{t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
