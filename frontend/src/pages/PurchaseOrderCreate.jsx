import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import DocumentForm, { PartyPicker, LineGrid, TotalsBlock, Fld, IdRow } from "@/components/erp/DocumentForm";
import { isInterstate, stateName } from "@/lib/gstState";

const DEFAULT_TC = "1) Goods must conform to the agreed specification and drawing.\n2) Delivery to be completed on or before the delivery date.\n3) Material test certificates / inspection reports to accompany the supply where applicable.";
const blankLine = () => ({ item_code: "", description: "", hsn: "", qty: 1, unit: "Nos", rate: 0, discount_pct: 0, discount_amount: 0, gst_rate: 18 });

export default function PurchaseOrderCreate() {
  const navg = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [suppliers, setSuppliers] = useState([]);
  const [companyState, setCompanyState] = useState("");
  // Set when the GST type was decided from the two states rather than chosen by hand, so the
  // form can say why it changed instead of silently flipping a tax setting.
  const [gstAuto, setGstAuto] = useState("");
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    code: "", date: today, delivery_date: "", reference: "",
    supplier_id: "", supplier_name: "", supplier_gstin: "", place_of_supply: "", is_interstate: false,
    terms_text: DEFAULT_TC, round_off: 0, notes: "",
  });
  const [lines, setLines] = useState([blankLine()]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [s, it] = await Promise.all([api.get("/suppliers"), api.get("/inventory/items")]);
        setSuppliers(s.data || []); setItems(it.data || []);
      } catch (e) { /* ignore */ }
    })();
    api.get("/settings/integrations").then(r => setCompanyState(r.data?.company_state || "")).catch(() => {});
    api.get("/masters").then(r => {
      const t = r.data?.doc_terms?.["Purchase Order"];
      if (t) setF(p => (p.terms_text === DEFAULT_TC || !p.terms_text ? { ...p, terms_text: t } : p));
    }).catch(() => {});
  }, []);

  // Picking a supplier also sets the place of supply, which decides CGST+SGST vs IGST. Only
  // filled when the user hasn't already typed one, so a manual override is never clobbered.
  const pickSupplier = (s) => {
    if (!s) {
      setF(p => ({ ...p, supplier_id: "", supplier_name: "", supplier_gstin: "" }));
      setGstAuto("");
      return;
    }
    // Same state as us -> CGST+SGST, different -> IGST. isInterstate returns null when either
    // state is missing or unrecognised, and in that case the existing choice is left alone: a
    // guess here would put the wrong tax on a filed document.
    const inter = isInterstate(companyState, s.state);
    setF(p => ({
      ...p,
      supplier_id: s.id, supplier_name: s.name || "", supplier_gstin: s.gstin || "",
      place_of_supply: s.state || p.place_of_supply || "",
      is_interstate: inter === null ? p.is_interstate : inter,
    }));
    setGstAuto(inter === null
      ? (s.state ? "" : "No state on this supplier — set GST type yourself")
      : `${inter ? "IGST" : "CGST+SGST"} — ${stateName(s.state) || "supplier"} vs ${stateName(companyState) || "your state"}`);
  };

  // Typing in the description column doubles as an item lookup: an exact match pulls the SKU,
  // HSN, GST rate and last cost across so those columns don't have to be retyped.
  const setLine = (i, k, v) => {
    if (k === "description") {
      const it = items.find(x => x.name === v);
      setLines(ls => ls.map((l, idx) => idx === i ? {
        ...l, description: v,
        item_code: it?.sku ?? l.item_code, hsn: it?.hsn ?? l.hsn,
        gst_rate: it?.gst_rate ?? l.gst_rate, rate: it?.unit_cost ?? l.rate,
      } : l));
      return;
    }
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  };
  const addLine = () => setLines(ls => [...ls, blankLine()]);
  const delLine = (i) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);

  const lineAmount = (l) => {
    let amt = Number(l.qty || 0) * Number(l.rate || 0);
    amt -= amt * Number(l.discount_pct || 0) / 100;
    amt -= Number(l.discount_amount || 0);
    return amt < 0 ? 0 : amt;
  };
  const totals = useMemo(() => {
    let subtotal = 0, gst = 0;
    for (const l of lines) { const a = lineAmount(l); subtotal += a; gst += a * Number(l.gst_rate || 0) / 100; }
    const grand = subtotal + gst + Number(f.round_off || 0);
    return { subtotal, gst, cgst: f.is_interstate ? 0 : gst / 2, sgst: f.is_interstate ? 0 : gst / 2, igst: f.is_interstate ? gst : 0, grand };
  }, [lines, f.round_off, f.is_interstate]);

  const save = async () => {
    if (saving) return;                       // Ctrl+S can fire faster than the request returns
    if (!f.supplier_id) { toast.error("Select a supplier"); return; }
    if (!lines.some(l => (l.description || "").trim())) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      const payload = {
        ...f, round_off: Number(f.round_off || 0), status: "sent",
        lines: lines.filter(l => (l.description || "").trim()).map(l => ({
          description: l.description, item_code: l.item_code, hsn: l.hsn,
          qty: Number(l.qty || 0), unit: l.unit, rate: Number(l.rate || 0),
          discount_pct: Number(l.discount_pct || 0), discount_amount: Number(l.discount_amount || 0),
          gst_rate: Number(l.gst_rate || 0),
        })),
      };
      const r = await api.post("/purchase-orders", payload);
      toast.success(`Purchase Order ${r.data?.code || ""} saved`);
      navg("/app/purchase-orders");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save purchase order"); }
    setSaving(false);
  };

  const columns = [
    { key: "description", label: "Item / description", datalist: "po-item-names", placeholder: "Type to search items…" },
    { key: "hsn", label: "HSN", width: 90 },
    { key: "qty", label: "Qty", type: "number", width: 80, step: "any" },
    { key: "unit", label: "Unit", width: 80 },
    { key: "rate", label: "Rate", type: "number", width: 110, step: "any" },
    { key: "discount_pct", label: "Disc %", type: "number", width: 80, step: "any" },
    { key: "discount_amount", label: "Disc amt", type: "number", width: 95, step: "any" },
    { key: "gst_rate", label: "GST %", type: "number", width: 80, step: "any" },
  ];

  return (
    <>
      <datalist id="po-item-names">{items.map(it => <option key={it.id} value={it.name} />)}</datalist>

      <DocumentForm
        testid="po-create-page"
        title="New Purchase Order"
        onBack={() => navg("/app/purchase-orders")}
        onCancel={() => navg("/app/purchase-orders")}
        saveLabel="Save Purchase Order"
        onSave={save}
        saving={saving}
        grand={totals.grand}
        termsValue={f.terms_text}
        onTermsChange={v => set("terms_text", v)}
        notes={f.notes}
        onNotesChange={v => set("notes", v)}

        party={
          <>
            <PartyPicker
              label="Supplier"
              required
              testid="po-supplier"
              options={suppliers}
              valueId={f.supplier_id}
              onPick={pickSupplier}
              placeholder="Search supplier by name, GSTIN or phone…"
            />
            <div className="mt-3">
              <Fld label="Supplier GSTIN">
                <Input value={f.supplier_gstin} onChange={e => set("supplier_gstin", e.target.value)} className="h-9" />
              </Fld>
            </div>
          </>
        }

        headerMid={
          <>
            <Fld label="Reference / Quote No">
              <Input value={f.reference} onChange={e => set("reference", e.target.value)} className="h-9" />
            </Fld>
            <Fld label="Place of Supply">
              <Input value={f.place_of_supply} onChange={e => set("place_of_supply", e.target.value)} placeholder="e.g. Gujarat" className="h-9" />
            </Fld>
          </>
        }

        headerRight={
          <>
            <IdRow label="PO No">
              <Input value={f.code} onChange={e => set("code", e.target.value)} placeholder="auto" className="h-9 text-right" />
            </IdRow>
            <IdRow label="PO Date">
              <Input type="date" value={f.date} onChange={e => set("date", e.target.value)} className="h-9" />
            </IdRow>
            <IdRow label="Delivery Date">
              <Input type="date" value={f.delivery_date} onChange={e => set("delivery_date", e.target.value)} className="h-9" />
            </IdRow>
            <IdRow label="GST Type">
              <select
                value={f.is_interstate ? "inter" : "intra"}
                onChange={e => { set("is_interstate", e.target.value === "inter"); setGstAuto(""); }}
                className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white"
                data-testid="po-gst-type"
              >
                <option value="intra">Intra-state (CGST+SGST)</option>
                <option value="inter">Inter-state (IGST)</option>
              </select>
            </IdRow>
            {gstAuto && (
              <div className="text-[11px] text-slate-500 text-right" data-testid="po-gst-auto">{gstAuto}</div>
            )}
          </>
        }

        totals={
          <TotalsBlock
            grand={totals.grand}
            rows={[
              { label: "Subtotal", value: totals.subtotal },
              f.is_interstate
                ? { label: "IGST", value: totals.igst }
                : { label: "CGST", value: totals.cgst },
              f.is_interstate ? null : { label: "SGST", value: totals.sgst },
              { label: "Round Off", value: f.round_off, editable: true, onChange: v => set("round_off", v), testid: "po-round-off" },
            ]}
          />
        }
      >
        <LineGrid
          columns={columns}
          lines={lines}
          onChange={setLine}
          onAdd={addLine}
          onRemove={delLine}
          onSave={save}
          amountOf={lineAmount}
        />
      </DocumentForm>
    </>
  );
}
