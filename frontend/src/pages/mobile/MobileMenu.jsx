import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  ShoppingCart, Truck, Receipt, FileText, ClipboardList,
  Boxes, SlidersHorizontal,
  Factory, ClipboardCheck, LayoutList, Gauge, Cog,
  Landmark, Wallet, FileSpreadsheet,
  BarChart3, FileBarChart, History,
  Settings, Users, FolderOpen, LifeBuoy, LogOut, ChevronRight,
} from "lucide-react";

const GROUPS = [
  {
    title: "My Business",
    items: [
      { label: "Sale", icon: ShoppingCart, to: "/app/invoices" },
      { label: "Purchase", icon: Truck, to: "/app/purchase-bills" },
      { label: "Expenses", icon: Receipt, to: "/app/expenses" },
      { label: "Quotations", icon: FileText, to: "/app/quotations" },
      { label: "Purchase Orders", icon: ClipboardList, to: "/app/purchase-orders" },
      { label: "Items", icon: Boxes, to: "/app/inventory" },
    ],
  },
  {
    title: "Manufacturing",
    items: [
      { label: "Work Orders", icon: Factory, to: "/app/work-orders" },
      { label: "Job Cards", icon: LayoutList, to: "/app/job-cards" },
      { label: "QC", icon: ClipboardCheck, to: "/app/qc" },
      { label: "Planning", icon: Gauge, to: "/app/planning" },
      { label: "Machines", icon: Cog, to: "/app/machines" },
    ],
  },
  {
    title: "Cash & Bank",
    items: [
      { label: "Bank Accounts / Cash", icon: Landmark, to: "/app/bank-cash" },
      { label: "Payments In", icon: Wallet, to: "/app/payments-in" },
      { label: "Payments Out", icon: Wallet, to: "/app/payments-out" },
    ],
  },
  {
    title: "Reports",
    items: [
      { label: "GST Reports", icon: FileSpreadsheet, to: "/app/gst-reports" },
      { label: "Financial Statements", icon: BarChart3, to: "/app/financial-statements" },
      { label: "Party Statements", icon: FileBarChart, to: "/app/statements" },
      { label: "Audit Log", icon: History, to: "/app/audit" },
    ],
  },
  {
    title: "Others",
    items: [
      { label: "Settings", icon: Settings, to: "/app/settings" },
      { label: "Users & Permissions", icon: Users, to: "/app/users" },
      { label: "Documents", icon: FolderOpen, to: "/app/documents" },
      { label: "Help & Support", icon: LifeBuoy, to: "/app" },
    ],
  },
];

export default function MobileMenu() {
  const nav = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="px-3 pt-3 pb-6 space-y-3">
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="font-semibold text-slate-900">{user?.name || "User"}</div>
        <div className="text-xs text-slate-500 mt-0.5">{user?.email}</div>
        <div className="text-[10px] uppercase font-semibold text-red-600 mt-1">{user?.role || ""}</div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.title} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-500">{g.title}</div>
          <div className="divide-y divide-slate-100">
            {g.items.map((it) => (
              <button key={it.label} onClick={() => nav(it.to)} className="w-full flex items-center justify-between px-4 py-3 active:bg-slate-50">
                <span className="flex items-center gap-3 text-sm text-slate-700"><it.icon className="h-4 w-4 text-slate-400" />{it.label}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={() => { logout(); nav("/login"); }}
        className="w-full flex items-center justify-center gap-2 bg-white rounded-xl border border-slate-200 py-3 text-sm font-semibold text-red-600 active:bg-red-50"
      >
        <LogOut className="h-4 w-4" /> Log Out
      </button>

      <div className="text-center text-[11px] text-slate-400 pt-1">Koshix · Denplex ERP</div>
    </div>
  );
}
