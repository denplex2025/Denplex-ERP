import { Badge } from "@/components/ui/badge";

/**
 * M.9 — Centralized status badge with consistent color coding across the app.
 *
 * Standard semantic colors:
 *   - Red:     Delayed / Overdue / Rejected / Cancelled / Critical
 *   - Blue:    Running / In Progress / Sent / Active
 *   - Amber:   QC Hold / Pending Review / Partial / Waiting
 *   - Emerald: Completed / Paid / Approved / Issued / Ready
 *   - Slate:   Planned / Draft / Unused / Inactive (neutral)
 */

const COLOR_PALETTE = {
  red:     "border-red-600 text-red-700 bg-red-50",
  blue:    "border-blue-600 text-blue-700 bg-blue-50",
  amber:   "border-amber-600 text-amber-700 bg-amber-50",
  emerald: "border-emerald-600 text-emerald-700 bg-emerald-50",
  slate:   "border-slate-400 text-slate-700 bg-slate-50",
  purple:  "border-purple-600 text-purple-700 bg-purple-50",
};

const STATUS_COLOR = {
  planned: "slate", draft: "slate",
  in_progress: "blue", running: "blue",
  qc: "amber", qc_hold: "amber", inspection_hold: "amber",
  on_hold: "red", paused: "amber",
  completed: "emerald", done: "emerald", ready: "emerald",
  cancelled: "slate", canceled: "slate",
  paid: "emerald", partial: "amber", partially_used: "amber",
  unpaid: "red", sent: "blue", overdue: "red",
  used: "emerald", unused: "slate",
  pass: "emerald", fail: "red", rework: "amber",
  accepted: "emerald", rejected: "red", converted: "emerald",
  issued: "emerald", settled: "slate",
  active: "emerald", inactive: "slate", delayed: "red",
  manufactured: "slate", bought_out: "blue", ready_made: "purple",
};

const formatLabel = (s) =>
  (s || "—").toString().replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function StatusBadge({ status, color, label, className = "" }) {
  const key = (status || "").toString().trim().toLowerCase();
  const c = color || STATUS_COLOR[key] || "slate";
  const tone = COLOR_PALETTE[c] || COLOR_PALETTE.slate;
  return (
    <Badge
      variant="outline"
      className={`rounded-sm uppercase text-[10px] font-semibold tracking-wider ${tone} ${className}`}
      data-testid={`status-badge-${key}`}
    >
      {label || formatLabel(status)}
    </Badge>
  );
}
