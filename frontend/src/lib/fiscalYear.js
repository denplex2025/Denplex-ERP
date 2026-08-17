/** India Financial Year (April 1 – March 31) helpers, shared across every report/dashboard
 * filter bar so "FY 2026-27" always means the same date range everywhere in the ERP. Mirrors
 * the backend's _fy_default_range() in server.py — keep both in sync if the FY boundary logic
 * ever changes. */

export const ALL_DATA = "all";

/** FY label for a given Date (defaults to today), e.g. "2026-27" */
export function fyLabelFor(date = new Date()) {
  const y = date.getMonth() + 1 >= 4 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** {from, to} ISO date strings (YYYY-MM-DD) for an FY label like "2026-27" */
export function fyToRange(label) {
  const y = parseInt(String(label).slice(0, 4), 10);
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

export function currentFYLabel() {
  return fyLabelFor(new Date());
}

export function currentFYRange() {
  return fyToRange(currentFYLabel());
}

/** Dropdown options: current FY + `back` previous years, newest first. */
export function fyOptions(back = 4) {
  const cur = parseInt(currentFYLabel().slice(0, 4), 10);
  const opts = [];
  for (let i = 0; i <= back; i++) {
    const y = cur - i;
    const label = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
    opts.push({ value: label, label: `FY ${label}`, ...fyToRange(label) });
  }
  return opts;
}
