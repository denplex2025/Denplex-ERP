import { fyOptions, ALL_DATA } from "@/lib/fiscalYear";

/** Shared Financial-Year selector for report/dashboard filter bars. Controlled: pass the
 * currently-selected value ("2026-27" or "all") and an onChange({ value, from, to }) — from/to
 * are null when value === "all" so the caller can drop its date bound entirely. Renders next to
 * (not instead of) any existing manual date-range inputs, so a user can still pick an exact
 * custom range when the FY preset isn't what they want. */
export default function FYFilter({ value, onChange, years = 4, className = "" }) {
  const options = fyOptions(years);
  const handle = (e) => {
    const v = e.target.value;
    if (v === ALL_DATA) { onChange({ value: v, from: null, to: null }); return; }
    const opt = options.find((o) => o.value === v);
    onChange({ value: v, from: opt?.from || null, to: opt?.to || null });
  };
  return (
    <select
      value={value}
      onChange={handle}
      title="Financial Year"
      className={`h-8 text-xs rounded-sm border border-slate-200 bg-white px-2 text-slate-700 font-medium ${className}`}
    >
      {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      <option value={ALL_DATA}>All Data</option>
    </select>
  );
}
