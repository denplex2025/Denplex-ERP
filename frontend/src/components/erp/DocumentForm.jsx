// Shared layout for every line-item document — Purchase Order, Sale Invoice, Quotation, Sale
// Order, Purchase Bill, Delivery Challan.
//
// Why one component: PurchaseOrderCreate and InvoiceCreate were already near-identical (same
// header grid, same line table, same terms-and-totals footer) and had drifted apart in small
// ways. Six copies of a layout is six places to fix every future change — the same trap as the
// five copies of the WhatsApp button.
//
// The split of responsibility: this file owns LAYOUT, KEYBOARD and DENSITY. The page still owns
// its own data, validation and totals maths, because those genuinely differ per document (a PO
// has no TDS; an invoice has no delivery-vs-order date distinction).
//
// Layout follows Vyapar's information hierarchy rather than its chrome: the party is the largest
// thing on the page because it is what you pick first, document identity is right-aligned where
// you glance to confirm a number, and everything you type repeatedly sits in one grid you can
// drive from the keyboard.

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, ArrowLeft, Search, X, ChevronDown } from "lucide-react";
import { money } from "@/lib/currency";

/* ------------------------------------------------------------------ small shared bits ----- */

export const Fld = ({ label, children, className = "" }) => (
  <div className={className}>
    <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="mt-1">{children}</div>
  </div>
);

/** Right-aligned label/value row — the document-identity column. */
const IdRow = ({ label, children }) => (
  <div className="flex items-center justify-end gap-3">
    <div className="text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">{label}</div>
    <div className="w-[190px]">{children}</div>
  </div>
);

/* ------------------------------------------------------------------------ party picker ----- */

/**
 * Searchable party selector. A plain <select> is unusable once there are 320 suppliers — you
 * cannot type "bec" and land on Bectochem. This filters as you type, and keeps the chosen
 * party's GSTIN and state visible underneath so a wrong pick is obvious before saving.
 */
export function PartyPicker({ label, options, valueId, onPick, placeholder = "Search…", required, testid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  const chosen = useMemo(() => (options || []).find(o => o.id === valueId) || null, [options, valueId]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = options || [];
    if (!t) return list.slice(0, 50);
    return list.filter(o =>
      String(o.name || "").toLowerCase().includes(t) ||
      String(o.gstin || "").toLowerCase().includes(t) ||
      String(o.phone || "").includes(t)
    ).slice(0, 50);
  }, [options, q]);

  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const choose = (o) => { onPick(o); setOpen(false); setQ(""); };

  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(results.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
    else if (e.key === "Enter" && open && results[hi]) { e.preventDefault(); choose(results[hi]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}{required && <span className="text-red-600"> *</span>}
      </div>

      {chosen && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setQ(""); setHi(0); }}
          data-testid={testid}
          className="mt-1 w-full text-left border border-slate-300 rounded-sm px-3 py-2 bg-white hover:border-slate-400"
        >
          <div className="font-semibold text-slate-900 leading-tight truncate">{chosen.name}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {chosen.gstin ? `GSTIN ${chosen.gstin}` : "No GSTIN on file"}
            {chosen.state ? ` · ${chosen.state}` : ""}
            {chosen.phone ? ` · ${chosen.phone}` : ""}
          </div>
        </button>
      ) : (
        <div className="mt-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            autoFocus={open}
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
            onFocus={() => setOpen(true)}
            onKeyDown={key}
            placeholder={placeholder}
            data-testid={testid}
            className="pl-8 h-[42px]"
          />
          {chosen && (
            <button type="button" onClick={() => { onPick(null); setQ(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-auto bg-white border border-slate-200 rounded-sm shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">No match for “{q}”.</div>
          ) : results.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => choose(o)}
              className={`w-full text-left px-3 py-2 border-b border-slate-50 last:border-0 ${i === hi ? "bg-slate-50" : ""}`}
            >
              <div className="text-sm text-slate-900 truncate">{o.name}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {o.gstin || "—"}{o.state ? ` · ${o.state}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------- line grid ----- */

/**
 * Editable line grid, driven by a column config, with the keyboard behaviour someone entering
 * ten lines a day actually needs:
 *
 *   Enter      next row, same column — and creates a row when you are on the last one
 *   Shift+Enter previous row
 *   Arrow up/down  move between rows without leaving the column
 *   Ctrl/Cmd+Enter save the document from anywhere in the grid
 *
 * Tab is deliberately left alone: the browser's own left-to-right order is already correct, and
 * hijacking it breaks screen readers and browser autofill.
 */
export function LineGrid({ columns, lines, onChange, onAdd, onRemove, onSave, amountOf, minRows = 1 }) {
  const cells = useRef({});
  const at = (r, c) => cells.current[`${r}:${c}`];

  const focusCell = (r, c) => {
    const el = at(r, c);
    if (el) { el.focus(); if (el.select) el.select(); }
  };

  const keyDown = (e, r, c) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onSave && onSave(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) { focusCell(r - 1, c); return; }
      if (r === lines.length - 1) { onAdd(); setTimeout(() => focusCell(r + 1, 0), 0); }
      else focusCell(r + 1, c);
      return;
    }
    if (e.key === "ArrowDown" && !e.shiftKey) { e.preventDefault(); focusCell(r + 1, c); }
    if (e.key === "ArrowUp" && !e.shiftKey) { e.preventDefault(); focusCell(r - 1, c); }
  };

  return (
    <div className="border border-slate-200 rounded-md erp-scroll-x">
      <table className="w-full erp-dense" style={{ minWidth: 720 }}>
        <colgroup>
          <col style={{ width: 34 }} />
          {columns.map((c, i) => <col key={i} style={c.width ? { width: c.width } : undefined} />)}
          <col style={{ width: 96 }} />
          <col style={{ width: 34 }} />
        </colgroup>
        <thead>
          <tr className="bg-slate-100 text-left uppercase tracking-wider text-slate-500">
            <th>#</th>
            {columns.map((c, i) => <th key={i} className={c.align === "right" ? "text-right" : ""}>{c.label}</th>)}
            <th className="text-right">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, r) => (
            <tr key={r} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="text-slate-400 tabular-nums">{r + 1}</td>
              {columns.map((c, ci) => (
                <td key={ci}>
                  <input
                    ref={el => { cells.current[`${r}:${ci}`] = el; }}
                    type={c.type === "number" ? "number" : "text"}
                    step={c.step}
                    list={c.datalist}
                    inputMode={c.type === "number" ? "decimal" : undefined}
                    value={l[c.key] ?? ""}
                    placeholder={c.placeholder}
                    onChange={e => onChange(r, c.key, e.target.value, c)}
                    onKeyDown={e => keyDown(e, r, ci)}
                    data-testid={`line-${r}-${c.key}`}
                    className={`w-full bg-transparent border border-transparent rounded-sm px-1.5 py-1
                      hover:border-slate-200 focus:border-slate-400 focus:bg-white outline-none
                      ${c.align === "right" || c.type === "number" ? "text-right tabular-nums" : ""}`}
                  />
                </td>
              ))}
              <td className="text-right tabular-nums whitespace-nowrap font-medium">{money(amountOf(l), { decimals: 2 })}</td>
              <td>
                <button
                  type="button"
                  onClick={() => onRemove(r)}
                  disabled={lines.length <= minRows}
                  title={lines.length <= minRows ? "A document needs at least one line" : "Remove line"}
                  className="text-slate-300 hover:text-red-600 disabled:opacity-30 disabled:hover:text-slate-300"
                  data-testid={`line-del-${r}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-3 px-2 py-2 border-t border-slate-100 bg-slate-50/50">
        <Button variant="outline" size="sm" className="rounded-sm h-7 text-xs" onClick={onAdd} data-testid="line-add">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add row
        </Button>
        <span className="text-[11px] text-slate-400">
          Enter for the next row · Ctrl+Enter to save
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ totals block ----- */

/**
 * Totals. `rows` is [{ label, value, editable, onChange, strong, sign }] so each document lists
 * only the lines it actually has — a PO has no TDS, an invoice does — rather than every form
 * carrying dead rows it renders conditionally.
 */
export function TotalsBlock({ rows, grand, grandLabel = "Total" }) {
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden h-fit">
      <div className="divide-y divide-slate-100">
        {rows.filter(Boolean).map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
            <span className="text-slate-500">{r.label}</span>
            {r.editable ? (
              <Input
                type="number"
                value={r.value}
                onChange={e => r.onChange(e.target.value)}
                className="h-7 w-28 text-right tabular-nums"
                data-testid={r.testid}
              />
            ) : (
              <span className="tabular-nums text-slate-800">{r.sign || ""}{money(r.value, { decimals: 2 })}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border-t border-slate-200">
        <span className="font-semibold text-slate-900">{grandLabel}</span>
        <span className="text-lg font-bold tabular-nums text-red-600" data-testid="doc-grand-total">
          {money(grand, { decimals: 2 })}
        </span>
      </div>
    </div>
  );
}

/**
 * Freight / Packing & Forwarding / Insurance — document-level charges that sit under the
 * subtotal and may carry their own GST.
 *
 * Each row is either a flat amount or a percentage of the subtotal. Entering a percentage
 * blanks the amount and vice versa, because a row that holds both is ambiguous on screen even
 * though the backend resolves it (percentage wins) — better that the form never shows a figure
 * that isn't the one being used.
 *
 * Deliberately collapsed until "Add charge" is pressed: most documents have no freight, and an
 * always-visible empty charges table is noise on every single one.
 */
export function ChargesEditor({ charges, onChange, subtotal = 0, defaultGstRate = 18 }) {
  const rows = charges || [];
  const set = (i, k, v) =>
    onChange(rows.map((c, idx) => {
      if (idx !== i) return c;
      const next = { ...c, [k]: v };
      // Keep the two mutually exclusive so what's typed is always what's charged.
      if (k === "pct" && v !== "") next.amount = "";
      if (k === "amount" && v !== "") next.pct = "";
      return next;
    }));
  const add = () => onChange([...rows, { name: "Freight", amount: "", pct: "", gst_rate: defaultGstRate }]);
  const del = (i) => onChange(rows.filter((_, idx) => idx !== i));

  // What each row will actually add, shown live so the number isn't a surprise on the PDF.
  const resolved = (c) => {
    const pct = Number(c.pct || 0);
    return pct ? (Number(subtotal || 0) * pct) / 100 : Number(c.amount || 0);
  };

  if (!rows.length) {
    return (
      <button type="button" onClick={add} data-testid="doc-add-charge"
        className="text-xs font-medium text-red-700 hover:underline">
        + Add freight / P&amp;F charge
      </button>
    );
  }

  return (
    <div className="border border-slate-200 rounded-md p-2 space-y-2" data-testid="doc-charges">
      {rows.map((c, i) => (
        <div key={i} className="flex items-end gap-1.5">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">Charge</label>
            <Input value={c.name || ""} onChange={e => set(i, "name", e.target.value)}
              placeholder="Freight" className="h-7 text-sm" />
          </div>
          <div className="w-16">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">%</label>
            <Input type="number" step="any" value={c.pct ?? ""} onChange={e => set(i, "pct", e.target.value)}
              className="h-7 text-sm text-right tabular-nums" />
          </div>
          <div className="w-24">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">Amount</label>
            <Input type="number" step="any" value={c.amount ?? ""} onChange={e => set(i, "amount", e.target.value)}
              className="h-7 text-sm text-right tabular-nums"
              placeholder={Number(c.pct || 0) ? resolved(c).toFixed(2) : ""} />
          </div>
          <div className="w-16">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">GST %</label>
            <Input type="number" step="any" value={c.gst_rate ?? ""} onChange={e => set(i, "gst_rate", e.target.value)}
              className="h-7 text-sm text-right tabular-nums" />
          </div>
          <button type="button" onClick={() => del(i)} title="Remove charge"
            className="h-7 px-1.5 text-slate-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" onClick={add} className="text-xs font-medium text-red-700 hover:underline">
          + Add another
        </button>
        <span className="text-[11px] text-slate-500">
          GST on charges is added to the document&apos;s tax
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ the shell ------- */

export default function DocumentForm({
  title, onBack, statusChip,
  party, headerMid, headerRight,        // three header columns
  children,                             // the line grid
  termsLabel = "Terms & Conditions", termsValue, onTermsChange,
  totals, notes, onNotesChange,
  saveLabel = "Save", onSave, saving, onCancel, extraActions,
  grand,
  testid,
}) {
  // Ctrl/Cmd+S anywhere on the form. People who live in spreadsheets reach for it, and the
  // browser's own Save Page dialog is never what they wanted.
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); onSave && onSave(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onSave]);

  return (
    <div data-testid={testid} className="pb-24">
      {/* Title bar */}
      <div className="flex items-center gap-2 mb-4">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} data-testid="doc-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-xl font-bold font-display tracking-tight">{title}</h1>
        {statusChip}
      </div>

      {/* Header. Party is deliberately the widest and the only thing with a heavier border —
          it is what you choose first and what makes the rest of the document mean anything. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1.1fr)_minmax(200px,0.9fr)_minmax(300px,1fr)] erp-grid mb-4 border border-slate-200 rounded-md p-3 bg-white">
        <div>{party}</div>
        <div className="space-y-3">{headerMid}</div>
        <div className="space-y-2 lg:pl-4 lg:border-l border-slate-100">{headerRight}</div>
      </div>

      {children}

      <div className="grid grid-cols-1 lg:grid-cols-2 erp-grid mt-4">
        <div className="space-y-3">
          <Fld label={termsLabel}>
            <Textarea rows={5} value={termsValue} onChange={e => onTermsChange(e.target.value)} data-testid="doc-terms" />
          </Fld>
          {onNotesChange && (
            <Fld label="Notes (internal)">
              <Textarea rows={2} value={notes} onChange={e => onNotesChange(e.target.value)} data-testid="doc-notes" />
            </Fld>
          )}
        </div>
        <div>{totals}</div>
      </div>

      {/* Sticky action bar. `left` follows the live sidebar width rather than the old hardcoded
          lg:left-64, which stopped being true once the sidebar became draggable. */}
      <div
        className="fixed bottom-0 right-0 left-0 bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-end gap-3 z-20"
        style={{ left: "var(--erp-rail-w, 0px)" }}
      >
        <span className="mr-auto text-sm text-slate-500">
          Total: <strong className="text-slate-900 tabular-nums">{money(grand, { decimals: 2 })}</strong>
        </span>
        {extraActions}
        {onCancel && <Button variant="outline" className="rounded-sm" onClick={onCancel}>Cancel</Button>}
        <Button onClick={onSave} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="doc-save">
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}

export { IdRow };
