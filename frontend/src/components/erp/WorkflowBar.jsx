import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/erp/Primitives";
import { ChevronRight, Factory } from "lucide-react";

const COLOR_CLASSES = {
  slate:   { bg: "bg-slate-100",   text: "text-slate-700",   accent: "bg-slate-400" },
  blue:    { bg: "bg-blue-50",     text: "text-blue-700",    accent: "bg-blue-500" },
  amber:   { bg: "bg-amber-50",    text: "text-amber-700",   accent: "bg-amber-500" },
  red:     { bg: "bg-red-50",      text: "text-red-700",     accent: "bg-red-600" },
  emerald: { bg: "bg-emerald-50",  text: "text-emerald-700", accent: "bg-emerald-500" },
};

/**
 * M.6 — Live workflow status bar for the shop floor.
 * Renders stages with counts as connected pills/chevrons.
 */
export default function WorkflowBar({ stages, onStageClick }) {
  if (!stages || !stages.length) return null;
  const total = stages.reduce((s, st) => s + (st.count || 0), 0);

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Factory className="h-4 w-4 text-red-600" />
          <div className="font-display font-semibold text-sm">Production Workflow</div>
          <span className="text-xs text-slate-500">({total} work orders across stages)</span>
        </div>
        <Link to="/app/work-orders" className="text-xs text-red-600 hover:underline">All Work Orders →</Link>
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {stages.map((st, i) => {
          const c = COLOR_CLASSES[st.color] || COLOR_CLASSES.slate;
          return (
            <div key={st.key || st.stage} className="flex items-stretch flex-1 min-w-[120px]">
              <button
                onClick={() => onStageClick?.(st)}
                className={`flex-1 rounded-sm border border-slate-200 ${c.bg} hover:shadow-sm transition-shadow text-left p-3 group`}
                data-testid={`workflow-stage-${st.key}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full ${c.accent}`}></span>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>{st.stage}</span>
                </div>
                <div className={`font-display text-2xl font-bold ${c.text}`}>{st.count}</div>
              </button>
              {i < stages.length - 1 && (
                <div className="flex items-center px-0.5 text-slate-300">
                  <ChevronRight className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Standalone connected wrapper — fetches shop-floor data itself. Use this on the Dashboard. */
export function LiveWorkflowBar() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/dashboard/shopfloor").then(r => setData(r.data)).catch(() => {});
  }, []);
  return <WorkflowBar stages={data?.workflow_stages} />;
}
