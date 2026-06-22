import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Factory, ClipboardCheck } from "lucide-react";

const TILES = [
  { to: "/worker/production", label: "Daily Production", icon: Factory, color: "bg-blue-600" },
  { to: "/worker/qc", label: "QC Entry", icon: ClipboardCheck, color: "bg-emerald-600" },
];

export default function WorkerHome() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-xl font-bold font-display mb-1">Hi {user?.name || "there"} 👋</h1>
      <p className="text-sm text-slate-500 mb-5">What do you want to record today?</p>
      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to}
            className={`${t.color} text-white rounded-2xl p-5 flex flex-col items-center justify-center gap-2 aspect-square shadow-sm active:scale-95 transition`}>
            <t.icon className="h-10 w-10" />
            <span className="font-semibold text-sm text-center leading-tight">{t.label}</span>
          </Link>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-6 text-center">Tip: add this page to your home screen for one-tap access.</p>
    </div>
  );
}
