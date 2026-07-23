import { useEffect, useState } from "react";

/** Excel-style manual column-width resizing for the plain <table> transaction views (Sales
 * Invoices, Purchase Bills, Party Ledger, Item Ledger, and any future report table). Widths persist
 * per-table in localStorage (keyed by `storageKey`) so a resize sticks around between visits, the
 * same way the app already persists the global zoom level.
 *
 * Usage:
 *   const [widths, startResize] = useColumnWidths("colw:sales-invoices", { date: 110, code: 110, ... });
 *   <table style={{ tableLayout: "fixed", width: "100%" }}>
 *     <colgroup>{Object.keys(widths).map(k => <col key={k} style={{ width: widths[k] }} />)}</colgroup>
 *     <thead><tr>
 *       <Th className="relative">Date<ColResizeHandle onMouseDown={startResize("date")} /></Th>
 *       ...
 */
export function useColumnWidths(storageKey, defaults) {
  const [widths, setWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return { ...defaults, ...saved };
    } catch {
      return { ...defaults };
    }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(widths)); } catch { /* ignore */ }
  }, [widths, storageKey]);

  const startResize = (key) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key] || defaults[key] || 120;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      setWidths((w) => ({ ...w, [key]: Math.max(60, Math.round(startW + delta)) }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const resetWidths = () => setWidths({ ...defaults });

  return [widths, startResize, resetWidths];
}

/** Thin drag handle pinned to the right edge of a header cell. The parent <Th> needs
 * `className="relative"` (or any `position: relative`) for the absolute positioning to anchor
 * correctly. Stops propagation so it doesn't trigger the column's sort/filter click. */
export function ColResizeHandle({ onMouseDown }) {
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none hover:bg-red-300/50 active:bg-red-400/70 z-10"
      title="Drag to resize column"
    />
  );
}
