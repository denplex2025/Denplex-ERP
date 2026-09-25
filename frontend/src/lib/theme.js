// Theme colour for the ERP.
//
// One hex is chosen; everything else is derived from it — the sidebar panel, its hover and active
// states, the footer/border tone, and the primary accent used by buttons and headings. Deriving
// rather than hand-listing five shades per theme means a new colour is one line, and the states
// stay in proportion to each other instead of drifting.
//
// All the presets sit in the red family on purpose. Destructive controls (delete, cancel) are
// red-600 in the markup and cannot be told apart from brand red by CSS alone, so a blue or green
// theme would make "delete" stop looking dangerous. Moving outside red needs the markup to
// separate brand from danger first — see the note in App.css.

const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  const s = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgbToHex = ({ r, g, b }) =>
  "#" + [r, g, b].map(v => clamp(v).toString(16).padStart(2, "0")).join("");

/** Mix toward black (amount < 0) or white (amount > 0). -0.2 = 20% darker. */
function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  return rgbToHex({ r: r + (t - r) * p, g: g + (t - g) * p, b: b + (t - b) * p });
}

/**
 * Relative luminance, used to decide whether labels on this colour should be white or near-black.
 * A picker that always assumes white text breaks the moment someone chooses a pale shade.
 */
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const readableOn = (hex) => (luminance(hex) > 0.45 ? "#1f2937" : "#ffffff");
export const contrastOn = (hex) => {
  const L = luminance(hex);
  const other = luminance(readableOn(hex));
  const [hi, lo] = L > other ? [L, other] : [other, L];
  return (hi + 0.05) / (lo + 0.05);
};

// Names and hexes as Neel supplied them from the scarlet chart.
export const THEMES = [
  { key: "blood-orange",  name: "Blood Orange",  hex: "#D1001C" },
  { key: "bu-scarlet",    name: "BU Scarlet",    hex: "#CC0000" },
  { key: "scarlet",       name: "Scarlet",       hex: "#FF2400" },
  { key: "deep-scarlet",  name: "Deep Scarlet",  hex: "#B01A00" },
  { key: "dark-scarlet",  name: "Dark Scarlet",  hex: "#560319" },
  { key: "crimson",       name: "Crimson",       hex: "#DC143C" },
  { key: "fire-brick",    name: "Fire Brick",    hex: "#B22222" },
  { key: "burnt-orange",  name: "Burnt Orange",  hex: "#CC5500" },
  { key: "medium-scarlet", name: "Medium Scarlet", hex: "#FC2847" },
  { key: "dark-tomato",   name: "Dark Tomato",   hex: "#FF6347" },
  { key: "indian-red",    name: "Indian Red",    hex: "#CD5C5C" },
  { key: "scarlet-rose",  name: "Scarlet Rose",  hex: "#C73D2A" },
];

export const DEFAULT_THEME = "#D1001C";   // Blood Orange
export const byHex = (hex) => THEMES.find(t => t.hex.toLowerCase() === String(hex || "").toLowerCase());

let current = (() => {
  try { return localStorage.getItem("erp_theme") || DEFAULT_THEME; }
  catch (e) { return DEFAULT_THEME; }
})();

const listeners = new Set();
export const getTheme = () => current;

/** "D1001C" / "#d1001c" / junk -> "#D1001C" / default. */
export function normalizeHex(hex) {
  const h = String(hex || "").trim().replace(/^#/, "");
  return /^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(h) ? "#" + h.toUpperCase() : DEFAULT_THEME;
}

/** Write the derived palette onto :root. Everything else in the app reads these. */
export function applyTheme(hex) {
  const base = normalizeHex(hex);
  const r = document.documentElement.style;
  r.setProperty("--erp-rail-bg", base);
  r.setProperty("--erp-rail-bg-dark", shade(base, -0.22));
  r.setProperty("--erp-rail-hover", shade(base, 0.14));
  r.setProperty("--erp-rail-text", readableOn(base));
  r.setProperty("--erp-rail-muted", readableOn(base) === "#ffffff" ? shade(base, 0.72) : shade(base, -0.45));
  r.setProperty("--erp-rail-active-bg", readableOn(base) === "#ffffff" ? "#ffffff" : "#1f2937");
  r.setProperty("--erp-rail-active-fg", readableOn(base) === "#ffffff" ? shade(base, -0.18) : "#ffffff");
  r.setProperty("--erp-accent", base);
  r.setProperty("--erp-accent-dark", shade(base, -0.18));
  r.setProperty("--erp-accent-soft", shade(base, 0.9));   // tinted row backgrounds
  return base;
}

export function setTheme(hex) {
  current = applyTheme(hex);
  try { localStorage.setItem("erp_theme", current); } catch (e) {}
  listeners.forEach(fn => { try { fn(current); } catch (e) {} });
  return current;
}

/** Call once at app start with the value from /masters. */
export function hydrateTheme(masters) {
  const hex = masters?.theme?.hex || masters?.theme;
  return setTheme(hex || current);
}

export function subscribeTheme(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Applied at import time so the first paint is already themed rather than flashing the CSS
// default and correcting a moment later.
applyTheme(current);
