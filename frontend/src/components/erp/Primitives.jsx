// Reusable page primitives
import { cn } from "@/lib/utils";

export const PageHeader = ({ overline, title, subtitle, actions }) => (
  <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
    <div>
      {overline && <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">{overline}</div>}
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">{title}</h1>
      {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);

export const Card = ({ className, children, ...props }) => (
  <div className={cn("bg-white border border-slate-200 rounded-sm shadow-sm", className)} {...props}>{children}</div>
);

export const Stat = ({ label, value, hint, accent, testid }) => (
  <div className="bg-white border border-slate-200 rounded-sm p-5" data-testid={testid}>
    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className={cn("font-display text-3xl font-bold mt-2", accent || "text-slate-900")}>{value}</div>
    {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
  </div>
);

export const Empty = ({ label }) => (
  <div className="text-center py-12 text-sm text-slate-500">{label || "No data yet."}</div>
);

export const Th = ({ children, className }) => (
  <th className={cn("text-left text-xs uppercase tracking-wider font-semibold text-slate-500 px-4 py-2.5 border-b border-slate-200 bg-slate-50", className)}>{children}</th>
);

export const Td = ({ children, className }) => (
  <td className={cn("px-4 py-2.5 text-sm text-slate-700 border-b border-slate-100", className)}>{children}</td>
);

export function inr(n) {
  if (n == null || isNaN(n)) return "₹0";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function fmtDate(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}
