import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, Factory, FileText, PackagePlus, ClipboardCheck, Receipt } from "lucide-react";

const ACTIONS = [
  { key: "wo",       label: "New Work Order",   icon: Factory,        to: "/app/work-orders",  color: "bg-blue-600 hover:bg-blue-700" },
  { key: "quote",    label: "New Quotation",    icon: FileText,       to: "/app/quotations",   color: "bg-purple-600 hover:bg-purple-700" },
  { key: "invoice",  label: "New Invoice",      icon: Receipt,        to: "/app/invoices",     color: "bg-cyan-600 hover:bg-cyan-700" },
  { key: "inv",      label: "Inventory",        icon: PackagePlus,    to: "/app/inventory",    color: "bg-emerald-600 hover:bg-emerald-700" },
  { key: "qc",       label: "QC Entry",         icon: ClipboardCheck, to: "/app/qc",           color: "bg-rose-600 hover:bg-rose-700" },
];

export default function FloatingActions() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleClick = (to) => { setOpen(false); navigate(to); };

  return (
    <div ref={ref} className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col items-end gap-2 mb-1">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.key} onClick={() => handleClick(a.to)}
                className="group flex items-center gap-2 shadow-md hover:shadow-lg transition-shadow"
                title={a.label}>
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
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-full pl-3 pr-4 py-3 shadow-lg transition-all ${
          open ? "bg-slate-700 hover:bg-slate-800" : "bg-blue-600 hover:bg-blue-700"
        } text-white`}
        title={open ? "Close" : "Quick actions"} aria-label="Quick actions">
        {open ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        <span className="font-semibold text-sm">{open ? "Close" : "Quick Actions"}</span>
      </button>
    </div>
  );
}
