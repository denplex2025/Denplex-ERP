import { PageHeader, Card } from "@/components/erp/Primitives";
import { Sparkles } from "lucide-react";

/** Shared placeholder for Procurement sub-modules that are scoped (nav entry + route live) but not
 * yet built — Purchase Requisition, Sourcing & Tendering, Goods Receipt. Keeps the sidebar structure
 * matching the target module list without faking data or half-building a feature. */
export default function ComingSoon({ overline = "Procurement", title, subtitle, blurb, capabilities = [] }) {
  return (
    <div data-testid="coming-soon-page">
      <PageHeader overline={overline} title={title} subtitle={subtitle} />
      <Card className="p-10 text-center max-w-2xl mx-auto">
        <div className="mx-auto h-12 w-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <Sparkles className="h-6 w-6 text-red-600" />
        </div>
        <div className="font-display text-lg font-bold text-slate-900">Coming Soon</div>
        {blurb && <p className="text-sm text-slate-600 mt-2">{blurb}</p>}
        {capabilities.length > 0 && (
          <div className="mt-6 text-left bg-slate-50 border border-slate-200 rounded-sm p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Planned capabilities</div>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {capabilities.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
