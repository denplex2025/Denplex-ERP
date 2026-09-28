// Deciding CGST+SGST vs IGST from two state strings.
//
// Under GST the split is by place of supply: same state as the seller means CGST+SGST, a
// different state means IGST. Getting it wrong is not cosmetic — it is the wrong tax on a
// document you file, so this is derived from the data rather than left as a dropdown someone
// remembers to change.
//
// The awkward part is that states are written inconsistently across the ERP: "24-Gujarat" in
// company settings, "Gujarat" on a supplier imported from Vyapar, sometimes "GUJARAT " with a
// stray space, occasionally just "24". So compare on the GST state code when either side has
// one, and fall back to a normalised name when neither does.

const CODE_BY_NAME = {
  "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03", "chandigarh": "04",
  "uttarakhand": "05", "uttaranchal": "05", "haryana": "06", "delhi": "07",
  "rajasthan": "08", "uttar pradesh": "09", "bihar": "10", "sikkim": "11",
  "arunachal pradesh": "12", "nagaland": "13", "manipur": "14", "mizoram": "15",
  "tripura": "16", "meghalaya": "17", "assam": "18", "west bengal": "19",
  "jharkhand": "20", "odisha": "21", "orissa": "21", "chhattisgarh": "22", "chattisgarh": "22",
  "madhya pradesh": "23", "gujarat": "24", "daman and diu": "26", "dadra and nagar haveli": "26",
  "maharashtra": "27", "karnataka": "29", "goa": "30", "lakshadweep": "31",
  "kerala": "32", "tamil nadu": "33", "puducherry": "34", "pondicherry": "34",
  "andaman and nicobar islands": "35", "telangana": "36", "telengana": "36",
  "andhra pradesh": "37", "ladakh": "38", "other territory": "97",
};

const clean = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** "24-Gujarat" / "24" / "Gujarat" -> "24". Empty when the state can't be identified. */
export function stateCode(state) {
  const s = clean(state);
  if (!s) return "";
  const lead = s.match(/^(\d{1,2})\b/);                  // "24-gujarat", "24 gujarat", "24"
  if (lead) return lead[1].padStart(2, "0");
  const name = s.replace(/^\d+\s*[-–—]\s*/, "")           // strip any leading code
               .replace(/[^a-z& ]/g, "").trim();
  return CODE_BY_NAME[name] || "";
}

/**
 * true  -> IGST, false -> CGST+SGST, null -> not enough information to decide.
 *
 * null matters: if either state is missing or unrecognised we must NOT silently pick a tax
 * treatment. The caller leaves the existing choice alone and the user decides.
 */
export function isInterstate(companyState, partyState) {
  const a = stateCode(companyState);
  const b = stateCode(partyState);
  if (!a || !b) {
    const na = clean(companyState).replace(/^\d+\s*[-–—]\s*/, "");
    const nb = clean(partyState).replace(/^\d+\s*[-–—]\s*/, "");
    if (!na || !nb) return null;
    return na !== nb;
  }
  return a !== b;
}

/** Display name without the code: "24-Gujarat" -> "Gujarat". */
export const stateName = (state) =>
  String(state || "").trim().replace(/^\d+\s*[-–—]\s*/, "");
