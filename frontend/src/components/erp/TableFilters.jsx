import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Filter } from "lucide-react";

/** Shared per-column filter primitives (Vyapar-style funnel-icon popovers), extracted out of
 * PartyLedgerSheet so any other document table (Items ledger, future modules) can reuse the same
 * checkbox-list / category+value filter UX without duplicating this code. */

export const TEXT_CATEGORIES = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "starts_with", label: "Starts with" },
];
export const DATE_CATEGORIES = [
  { value: "equal", label: "Equal To" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
];
export const NUM_CATEGORIES = [
  { value: "equal", label: "Equal to" },
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
];

export function matchesText(fieldVal, f) {
  if (!f.value) return true;
  const v = String(fieldVal || "").toLowerCase();
  const needle = f.value.toLowerCase();
  if (f.category === "equals") return v === needle;
  if (f.category === "starts_with") return v.startsWith(needle);
  return v.includes(needle);
}
export function matchesDate(fieldVal, f) {
  if (!f.value) return true;
  if (!fieldVal) return false;
  const d = String(fieldVal).slice(0, 10);
  if (f.category === "before") return d < f.value;
  if (f.category === "after") return d > f.value;
  return d === f.value;
}
export function matchesNum(fieldVal, f) {
  if (f.value === "" || f.value == null) return true;
  const n = Number(fieldVal || 0);
  const v = Number(f.value);
  if (Number.isNaN(v)) return true;
  if (f.category === "gt") return n > v;
  if (f.category === "lt") return n < v;
  return n === v;
}

/** Small funnel icon in a column header that opens a filter popover, matching the per-column
 * filter pattern (checkbox list or category+value) used throughout Vyapar's transaction tables. */
export function ColumnFilterPopover({ active, renderContent }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex ml-1 ${active ? "text-red-600" : "text-slate-400 hover:text-slate-600"}`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 rounded-sm" onClick={(e) => e.stopPropagation()}>
        {renderContent(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

export function CheckboxFilterContent({ options, committed, onApply, onClear, close }) {
  const [draft, setDraft] = useState(committed);
  const toggle = (v) => setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  return (
    <div className="space-y-2">
      {options.length === 0 ? (
        <div className="text-xs text-slate-400">No values to filter.</div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={draft.includes(o)} onCheckedChange={() => toggle(o)} />
              <span className="truncate">{o}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="rounded-sm flex-1 h-7 text-xs" onClick={() => { onClear(); close(); }}>Clear</Button>
        <Button type="button" size="sm" className="rounded-sm flex-1 h-7 text-xs bg-red-600 hover:bg-red-700" onClick={() => { onApply(draft); close(); }}>Apply</Button>
      </div>
    </div>
  );
}

export function CategoryFilterContent({ categoryOptions, inputType, valueLabel, committed, onApply, onClear, close }) {
  const [category, setCategory] = useState(committed.category);
  const [val, setVal] = useState(committed.value);
  return (
    <div className="space-y-2.5">
      <div>
        <Label className="text-xs text-slate-500">Select Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="rounded-sm h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categoryOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-slate-500">{valueLabel}</Label>
        <Input type={inputType} value={val} onChange={(e) => setVal(e.target.value)} className="rounded-sm h-8 text-sm mt-1" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="rounded-sm flex-1 h-7 text-xs" onClick={() => { onClear(); close(); }}>Clear</Button>
        <Button type="button" size="sm" className="rounded-sm flex-1 h-7 text-xs bg-red-600 hover:bg-red-700" onClick={() => { onApply({ category, value: val }); close(); }}>Apply</Button>
      </div>
    </div>
  );
}
