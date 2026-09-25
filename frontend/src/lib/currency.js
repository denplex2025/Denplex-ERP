// Currency for the whole ERP — symbol, number formatting, and the icon that goes with it.
//
// Before this existed, ten pages each carried their own private `const inr = ...` and
// Primitives exported an eleventh. Changing the currency meant finding all eleven, and the
// lucide `Receipt` icon used across the nav has a dollar sign baked into its artwork, so the
// ERP showed "$" on five menu rows while every figure read "₹".
//
// The setting lives in the backend masters (`/masters` -> currency) so it is per-company rather
// than per-browser, and every screen and PDF agrees.

import { useEffect, useState } from "react";
import {
  Receipt, ReceiptIndianRupee, ReceiptEuro, ReceiptPoundSterling, ReceiptJapaneseYen, ReceiptText,
  IndianRupee, DollarSign, Euro, PoundSterling, JapaneseYen, Banknote,
} from "lucide-react";

// `locale` drives digit grouping, which is not cosmetic: en-IN groups as 42,90,878 (lakh/crore)
// and en-US as 4,290,878. Getting that wrong makes an Indian invoice look foreign.
export const CURRENCIES = [
  { code: "INR", symbol: "₹",  name: "Indian Rupee",        locale: "en-IN", receipt: ReceiptIndianRupee,   glyph: IndianRupee },
  { code: "USD", symbol: "$",  name: "US Dollar",           locale: "en-US", receipt: Receipt,              glyph: DollarSign },
  { code: "EUR", symbol: "€",  name: "Euro",                locale: "de-DE", receipt: ReceiptEuro,          glyph: Euro },
  { code: "GBP", symbol: "£",  name: "Pound Sterling",      locale: "en-GB", receipt: ReceiptPoundSterling, glyph: PoundSterling },
  { code: "AED", symbol: "AED", name: "UAE Dirham",         locale: "en-AE", receipt: ReceiptText,          glyph: Banknote },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal",        locale: "en-SA", receipt: ReceiptText,          glyph: Banknote },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar",    locale: "en-SG", receipt: Receipt,              glyph: DollarSign },
  { code: "AUD", symbol: "A$", name: "Australian Dollar",   locale: "en-AU", receipt: Receipt,              glyph: DollarSign },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar",     locale: "en-CA", receipt: Receipt,              glyph: DollarSign },
  { code: "JPY", symbol: "¥",  name: "Japanese Yen",        locale: "ja-JP", receipt: ReceiptJapaneseYen,   glyph: JapaneseYen, decimals: 0 },
  { code: "CNY", symbol: "CN¥", name: "Chinese Yuan",       locale: "zh-CN", receipt: ReceiptText,          glyph: Banknote },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc",        locale: "de-CH", receipt: ReceiptText,          glyph: Banknote },
];

const DEFAULT = CURRENCIES[0];                       // INR — this is an Indian ERP
export const byCode = (code) => CURRENCIES.find(c => c.code === code) || DEFAULT;

// Cached in localStorage as well as memory so a page load renders the right symbol immediately
// instead of flashing ₹ and then correcting itself once /masters answers.
let current = (() => {
  try { return byCode(localStorage.getItem("erp_currency") || DEFAULT.code); }
  catch (e) { return DEFAULT; }
})();

const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(current); } catch (e) {} });

export const getCurrency = () => current;

export function setCurrency(code) {
  const next = byCode(code);
  if (next.code === current.code) return current;
  current = next;
  try { localStorage.setItem("erp_currency", next.code); } catch (e) {}
  notify();
  return current;
}

/** Call once at app start with the value from /masters. */
export function hydrateCurrency(masters) {
  const code = masters?.currency?.code || masters?.currency;
  if (code) setCurrency(code);
  return current;
}

/** Re-render a component when the currency changes. */
export function useCurrency() {
  const [c, setC] = useState(current);
  useEffect(() => {
    listeners.add(setC);
    setC(current);            // a change between render and effect would otherwise be missed
    return () => listeners.delete(setC);
  }, []);
  return c;
}

/**
 * Format an amount. Replaces the ten private `inr()` helpers.
 *
 *   money(1234.5)                 -> "₹1,234.5"
 *   money(1234.5, { decimals: 2 })-> "₹1,234.50"
 *   money(1234.5, { symbol: false })
 */
export function money(n, opts = {}) {
  const c = opts.currency ? byCode(opts.currency) : current;
  if (n == null || n === "" || isNaN(n)) return opts.symbol === false ? "0" : `${c.symbol}0`;
  const max = opts.decimals != null ? opts.decimals : (c.decimals != null ? c.decimals : 2);
  const min = opts.decimals != null ? opts.decimals : 0;
  const s = Number(n).toLocaleString(c.locale, { minimumFractionDigits: min, maximumFractionDigits: max });
  return opts.symbol === false ? s : `${c.symbol}${s}`;
}

/** Short form for chart axes and tight cards: ₹3.2L / $320k. */
export function moneyCompact(n) {
  const c = current;
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (c.code === "INR") {
    if (a >= 1e7) return `${sign}${c.symbol}${(a / 1e7).toFixed(2)}Cr`;
    if (a >= 1e5) return `${sign}${c.symbol}${(a / 1e5).toFixed(2)}L`;
    if (a >= 1e3) return `${sign}${c.symbol}${(a / 1e3).toFixed(1)}k`;
  } else {
    if (a >= 1e9) return `${sign}${c.symbol}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}${c.symbol}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${sign}${c.symbol}${(a / 1e3).toFixed(1)}k`;
  }
  return `${sign}${c.symbol}${a.toFixed(0)}`;
}

export const currencySymbol = () => current.symbol;

/**
 * Receipt icon that matches the currency. lucide's plain `Receipt` has a dollar sign drawn into
 * it, which is why five nav rows read "$" on a rupee system — this picks the right variant
 * instead, and falls back to a currency-free receipt for codes lucide doesn't draw.
 */
export function ReceiptIcon(props) {
  const c = useCurrency();
  const Icon = c.receipt || ReceiptText;
  return <Icon {...props} />;
}

/** Bare currency glyph, for buttons and badges. */
export function CurrencyIcon(props) {
  const c = useCurrency();
  const Icon = c.glyph || Banknote;
  return <Icon {...props} />;
}
