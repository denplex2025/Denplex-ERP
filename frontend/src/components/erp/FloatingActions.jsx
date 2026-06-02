import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, X, Factory, FileText, PackagePlus, Truck, ClipboardCheck,
  ShoppingCart, Receipt,
} from "lucide-react";

/**
 * M.8 — FloatingActions
 * Bottom-right floating action button. Click "+" to expand a vertical
 * stack of quick-create shortcuts. Available on every /app/* page.
 */

const ACTIONS = [
  { key: "wo",       label: "New Work Order",   icon: Factory,         to: "/app/work-orders?new=1",       color: "bg-blue-600 hover:bg-blue-700" },
  { key: "quote",    label: "New Quotation",    icon: FileText,        to: "/app/quotations?new=1",        color: "bg-purple-600 hover:bg-purple-700" },
  { key: "grn",      label: "Material Inward",  icon: PackagePlus,     to: "/app/grn?new=1",               color: "bg-emerald-600 hover:bg-emerald-700" },
  { key: "dispatch", label: "Dispatch / DC",    icon: Truck,           to: "/app/docs/delivery-challans?new=1", color: "bg-amber-600 hover:bg-amber-700" },
  { key: "qc",       label: "QC Entry",         icon: ClipboardCheck,  to: "/app/qc?new=1",                color: "bg-rose-600 hover:bg-rose-700" },
  { key: "invoice",  label: "New Invoice",      icon: Receipt,         to: "/app/invoices?new=1",          color: "bg-cyan-600 hover:bg-cyan-700" },
  { key: "po",       label: "New PO",           icon: ShoppingCart,    to: "/app/purchase-orders?new=1",   color: "bg-indigo-600 hover:bg-indigo-700" },
];

export default function FloatingActions() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleClick = (to) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col items-end gap-2 mb-1">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.key}
                onClick={() => handleClick(a.to)}
                className="group flex items-center gap-2 shadow-md hover:shadow-lg transition-shadow"
                title={a.label}
              >
                <span className="bg-white border border-slate-200 rounded-md px-3 py-1 text-xs font-medium text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {a.label}
                </span>
                <span className={`${a.color} text-white rounded-full p-3 flex items-center justify-center transition-colors`}>
                  <Icon className="w-5 h-5" />
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-full p-4 shadow-lg transition-all ${
          open ? "bg-slate-700 hover:bg-slate-800 rotate-45" : "bg-blue-600 hover:bg-blue-700"
        } text-white`}
        title={open ? "Close" : "Quick actions"}
        aria-label="Quick actions"
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>
    </div>
  );
}
