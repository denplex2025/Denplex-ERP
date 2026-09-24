// Shared WhatsApp helpers.
//
// Why this file exists: the same "send on WhatsApp" logic had been copy-pasted into five places
// (LineItemDoc, Invoices, PurchaseBills, InvoiceDualPane, CrudPage). Fixing one on 2026-09-17
// left the other four broken, which only surfaced when a live test on Sale Invoices produced the
// old message. Everything WhatsApp-related now lives here so the next change happens once.

/**
 * wa.me requires a full international number with no "+". A bare 10-digit Indian mobile is not
 * valid there - WhatsApp either guesses the country or fails outright, so it can silently open
 * the wrong chat. Normalise before building any link.
 */
export function waPhone(raw) {
  // Leading zeros are never significant in an E.164 number - they are either the domestic trunk
  // prefix (0 98765 43210) or the international dialling prefix (00 91 98765 43210). Stripping
  // them first collapses every variant people actually type into one shape.
  const d = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  if (d.length === 10) return "91" + d;                        // 9876543210
  if (d.length === 12 && d.startsWith("91")) return d;         // 919876543210
  return d;                                                    // already international
}

/**
 * Find a party for a document row.
 *
 * The Vyapar importer historically wrote customer_id / supplier_id as "" (fixed at source on
 * 2026-09-22, but older records only get ids back after a re-import with update_existing). So
 * always fall back to an exact, case-insensitive name match rather than trusting the id alone.
 *
 * Returns null when the party isn't in the list at all - callers should say so rather than
 * reporting a missing phone number, because those are different problems.
 */
export function findParty(parties, row, { idField, nameField }) {
  const id = row && row[idField];
  const byId = id && (parties || []).find((p) => p.id === id);
  if (byId) return byId;
  const nm = String((row && row[nameField]) || "").trim().toLowerCase();
  if (!nm) return null;
  return (parties || []).find((p) => String(p.name || "").trim().toLowerCase() === nm) || null;
}

const money = (n) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const shortDate = (s) => {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(s).slice(0, 10);
  }
};

/**
 * Build the message body for a document.
 *
 * Sends the actual line items, not just a total - a supplier can't act on "Total: ₹30,090", and
 * the old wording claimed a document was "attached" when wa.me cannot attach anything.
 */
export function buildDocMessage({ companyName, docLabel, row, maxLines = 15 }) {
  const all = (row && row.lines) || [];
  const shown = all.slice(0, maxLines).map((l, i) => {
    const qty = `${l.qty ?? ""} ${l.unit || "Nos"}`.trim();
    const rate = Number(l.rate) ? ` @ ${money(l.rate)}` : "";
    return `${i + 1}. ${l.description || l.item_code || "Item"} — ${qty}${rate}`;
  });
  return [
    companyName || "Denplex Engineering Company",
    `${docLabel} ${row.code}${row.date ? ` · ${shortDate(row.date)}` : ""}`,
    "",
    ...(shown.length ? shown : ["(details in the attached document)"]),
    ...(all.length > maxLines ? [`…and ${all.length - maxLines} more item(s)`] : []),
    "",
    `Total${Number(row.gst_total) ? " incl. GST" : ""}: ${money(row.total)}`,
    ...(row.due_date ? [`Due: ${shortDate(row.due_date)}`] : []),
    ...(row.delivery_date ? [`Delivery by: ${shortDate(row.delivery_date)}`] : []),
    ...(row.notes ? ["", String(row.notes)] : []),
  ].join("\n");
}

/**
 * Open WhatsApp with the chat and message pre-filled. The send stays a deliberate human action -
 * this only opens whichever WhatsApp is installed (or WhatsApp Web, using whichever account is
 * linked there, so link the BUSINESS account on a work machine).
 *
 * Returns { ok } or { ok: false, error } so callers can toast a specific message.
 */
export function openWhatsAppForDoc({ parties, row, idField, nameField, companyName, docLabel, partyLabel = "party" }) {
  const party = findParty(parties, row, { idField, nameField });
  if (!party) {
    return {
      ok: false,
      error: `"${(row && row[nameField]) || "This party"}" isn't in the ${partyLabel} list yet — add them with a phone number first`,
    };
  }
  const phone = waPhone(party.phone);
  if (!phone) return { ok: false, error: `No phone number on file for ${party.name}` };

  const msg = buildDocMessage({ companyName, docLabel, row });
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  return { ok: true, party, phone };
}
