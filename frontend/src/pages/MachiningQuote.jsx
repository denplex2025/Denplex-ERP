import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

const fileToB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const Fld = ({ label, children }) => (<div><Label className="text-[11px] uppercase tracking-wider text-slate-500">{label}</Label><div className="mt-1">{children}</div></div>);
const ROW_LABELS = {
  setup: "Setup (whole batch)", facing: "Facing", roughing: "Roughing", drilling: "Drilling",
  profile_finish: "Profile finish", turning: "Turning", spec_uplift: "Tolerance / finish uplift",
  total: "Total",
};

export default function MachiningQuote() {
  const [machines, setMachines] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [material, setMaterial] = useState("");
  const [partName, setPartName] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  // Batch size drives setup amortisation — setup is paid once per batch, not once per part.
  const [qty, setQty] = useState("1");
  const [tolerance, setTolerance] = useState("0.125");
  const [finishRa, setFinishRa] = useState("3.2");
  // Costing inputs. Blank = "not included" rather than zero-priced, so the quote never
  // silently invents a material rate the shop hasn't entered.
  const [matPrice, setMatPrice] = useState("");
  const [scrapPct, setScrapPct] = useState("");
  const [toolCost, setToolCost] = useState("");
  const [toolLife, setToolLife] = useState("");
  const [overheadPct, setOverheadPct] = useState("");
  const [showCosting, setShowCosting] = useState(false);
  // Adding a machine we don't own — a supplier's lathe, VMC, grinder — without leaving the quote.
  const [presets, setPresets] = useState([]);
  const [presetNote, setPresetNote] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [nm, setNm] = useState({ preset: "", name: "", supplier_id: "", supplier_name: "", hourly_rate: "", ownership: "supplier" });
  const [addBusy, setAddBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const stepRef = useRef(null);

  const loadMachines = () =>
    api.get("/machines").then((r) => setMachines(Array.isArray(r.data) ? r.data : [])).catch(() => {});

  useEffect(() => {
    loadMachines();
    api.get("/machining/materials").then((r) => setMaterials(r.data?.materials || [])).catch(() => {});
    api.get("/machines/presets").then((r) => {
      setPresets(r.data?.presets || []);
      setPresetNote(r.data?.note || "");
    }).catch(() => {});
    api.get("/suppliers").then((r) => setSuppliers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picking a preset fills the rate and the machine's capability fields, so a supplier machine
  // can be added in two fields instead of fifteen. Everything stays editable afterwards.
  const applyPreset = (key) => {
    const p = presets.find((x) => x.key === key);
    setNm((s) => ({
      ...s,
      preset: key,
      name: s.name || (p ? p.label.split(" —")[0] : ""),
      hourly_rate: p ? String(p.hourly_rate) : s.hourly_rate,
    }));
  };

  const addMachine = async () => {
    if (addBusy) return;
    if (!nm.name.trim()) { toast.error("Give the machine a name"); return; }
    const p = presets.find((x) => x.key === nm.preset);
    if (!p) { toast.error("Pick a machine type"); return; }
    setAddBusy(true);
    try {
      // Preset supplies the capability fields; the form overrides name, rate and supplier.
      const { key, label, confidence, ...caps } = p;
      const payload = {
        ...caps,
        name: nm.name.trim(),
        ownership: nm.ownership,
        supplier_id: nm.ownership === "supplier" ? nm.supplier_id : "",
        supplier_name: nm.ownership === "supplier" ? nm.supplier_name : "",
        // A subcontract rate is all-in (their machine, operator, overhead, margin), so the
        // backend will refuse to add our overhead % on top of it.
        rate_is_all_inclusive: nm.ownership === "supplier",
        hourly_rate: Number(nm.hourly_rate || p.hourly_rate || 0),
        notes: nm.ownership === "supplier"
          ? `Subcontracted. Rate is a starting estimate (${confidence}) — replace with the supplier's quoted rate.`
          : "",
      };
      const r = await api.post("/machines", payload);
      await loadMachines();
      const newId = r.data?.id || r.data?._id;
      if (newId) setMachineId(newId);
      setHourlyRate(String(payload.hourly_rate));
      setAddOpen(false);
      setNm({ preset: "", name: "", supplier_id: "", supplier_name: "", hourly_rate: "", ownership: "supplier" });
      toast.success(`${payload.name} added`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add the machine");
    }
    setAddBusy(false);
  };

  const selectedMachine = machines.find((m) => (m._id || m.id) === machineId);
  useEffect(() => {
    if (selectedMachine && !hourlyRate) setHourlyRate(String(selectedMachine.hourly_rate || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId]);

  const generate = async () => {
    const step = stepRef.current?.files?.[0];
    if (!step) { toast.error("Upload a STEP (.step/.stp) file"); return; }
    if (!machineId) { toast.error("Pick a machine"); return; }
    if (!material) { toast.error("Pick a material"); return; }
    const nm = (step.name || "").toLowerCase();
    if (!nm.endsWith(".step") && !nm.endsWith(".stp")) { toast.error("Only STEP files (.step/.stp) are supported"); return; }

    setBusy(true); setResult(null); setError("");
    try {
      const step_base64 = await fileToB64(step);
      // Blank costing fields are sent as 0, which the service reads as "not included" and says
      // so in its notes — rather than quietly costing material at zero.
      const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
      const r = await api.post("/machining/quote", {
        step_base64, machine_id: machineId, material,
        part_name: partName, hourly_rate: hourlyRate ? Number(hourlyRate) : undefined,
        qty: Math.max(parseInt(qty, 10) || 1, 1),
        tolerance_mm: tolerance,
        surface_finish_ra: finishRa,
        material_price_per_kg: num(matPrice),
        scrap_pct: num(scrapPct),
        tool_cost: num(toolCost),
        tool_life_parts: parseInt(toolLife, 10) || 0,
        overhead_pct: num(overheadPct),
      });
      setResult(r.data);
      toast.success("Quote ready");
    } catch (e) {
      const detail = e?.response?.data?.detail || "Quote failed";
      setError(detail);
      toast.error(e?.response?.status === 503 ? "Set MACHINING_SERVICE_URL in Railway → Variables." : detail);
    }
    setBusy(false);
  };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="h-5 w-5 text-red-600" />
        <h1 className="text-2xl font-bold">Machining Quote</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Upload a STEP file, pick a machine and material, and get a geometry-based cycle-time and cost estimate
        (material-removal-rate + feed/speed formulas on the real part geometry — not a simulated G-code toolpath).
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Fld label="STEP file (.step / .stp)">
              <input ref={stepRef} type="file" accept=".step,.stp" className="text-sm" />
            </Fld>
            <Fld label="Part name (optional)">
              <Input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="e.g. L-Header bracket" />
            </Fld>
            <Fld label="Machine">
              {(() => {
                const opt = (m) => {
                  const axesLabel = m.axes
                    ? (m.simultaneous_axes && m.simultaneous_axes < m.axes
                        ? `(${m.simultaneous_axes}+${m.axes - m.simultaneous_axes})`
                        : `(${m.axes}-axis)`)
                    : "";
                  return (
                    <option key={m._id || m.id} value={m._id || m.id}>
                      {m.name} {axesLabel} {m.code ? `· ${m.code}` : ""}
                      {m.ownership === "supplier" && m.supplier_name ? ` — ${m.supplier_name}` : ""}
                    </option>
                  );
                };
                // Split the list so it's obvious at a glance whether the job runs in-house or
                // goes out — they cost differently and one of them you can't schedule.
                const mine = machines.filter((m) => m.ownership !== "supplier");
                const theirs = machines.filter((m) => m.ownership === "supplier");
                return (
                  <select value={machineId} onChange={(e) => setMachineId(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                    <option value="">— Select machine —</option>
                    {mine.length > 0 && <optgroup label="Our machines">{mine.map(opt)}</optgroup>}
                    {theirs.length > 0 && <optgroup label="Supplier / subcontract">{theirs.map(opt)}</optgroup>}
                  </select>
                );
              })()}
              <div className="flex items-center justify-between mt-1">
                {machines.length === 0
                  ? <p className="text-xs text-amber-600">No machines yet — add one here or under Production → Machines.</p>
                  : <span />}
                <button type="button" onClick={() => setAddOpen((v) => !v)}
                  className="text-xs font-medium text-red-700 hover:underline" data-testid="mq-add-machine">
                  {addOpen ? "− Cancel" : "+ Add a machine"}
                </button>
              </div>
              {selectedMachine?.ownership === "supplier" && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Subcontracted{selectedMachine.supplier_name ? ` to ${selectedMachine.supplier_name}` : ""} —
                  the rate is their all-in job-work price, so no overhead % is added on top.
                </p>
              )}
            </Fld>

            {addOpen && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3" data-testid="mq-add-machine-form">
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="radio" checked={nm.ownership === "supplier"}
                      onChange={() => setNm((s) => ({ ...s, ownership: "supplier" }))} />
                    Supplier&apos;s machine
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="radio" checked={nm.ownership === "in_house"}
                      onChange={() => setNm((s) => ({ ...s, ownership: "in_house" }))} />
                    Ours
                  </label>
                </div>

                <Fld label="Machine type">
                  <select value={nm.preset} onChange={(e) => applyPreset(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-9">
                    <option value="">— Select type —</option>
                    {presets.map((p) => (
                      <option key={p.key} value={p.key}>{p.label} · ₹{p.hourly_rate}/hr</option>
                    ))}
                  </select>
                </Fld>

                <div className="grid grid-cols-2 gap-3">
                  <Fld label="Name">
                    <Input value={nm.name} onChange={(e) => setNm((s) => ({ ...s, name: e.target.value }))}
                      placeholder="e.g. Shah Engg CNC Lathe" className="h-9" />
                  </Fld>
                  <Fld label="Rate (₹/hr)">
                    <Input type="number" min="0" value={nm.hourly_rate}
                      onChange={(e) => setNm((s) => ({ ...s, hourly_rate: e.target.value }))}
                      placeholder="from type" className="h-9 text-right tabular-nums" />
                  </Fld>
                </div>

                {nm.ownership === "supplier" && (
                  <Fld label="Supplier (optional)">
                    <select
                      value={nm.supplier_id}
                      onChange={(e) => {
                        const s = suppliers.find((x) => (x._id || x.id) === e.target.value);
                        setNm((v) => ({ ...v, supplier_id: e.target.value, supplier_name: s?.name || "" }));
                      }}
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-9">
                      <option value="">— Not linked —</option>
                      {suppliers.map((s) => (
                        <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>
                      ))}
                    </select>
                  </Fld>
                )}

                {nm.preset && (() => {
                  const p = presets.find((x) => x.key === nm.preset);
                  if (!p) return null;
                  const weak = /weak|estimate/i.test(p.confidence);
                  return (
                    <p className={`text-[11px] ${weak ? "text-amber-700" : "text-slate-500"}`}>
                      ₹{p.hourly_rate}/hr is a starting point ({p.confidence}). Replace it with your
                      supplier&apos;s quoted rate once you have one.
                    </p>
                  );
                })()}

                <Button onClick={addMachine} disabled={addBusy}
                  className="bg-red-600 hover:bg-red-700 text-white w-full h-9">
                  {addBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add machine"}
                </Button>
                {presetNote && <p className="text-[10px] text-slate-400 leading-snug">{presetNote}</p>}
              </div>
            )}
            <Fld label="Material">
              <select value={material} onChange={(e) => setMaterial(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                <option value="">— Select material —</option>
                {materials.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </Fld>
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Hourly rate (₹/hr)">
                <Input type="number" min="0" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="machine's rate" />
              </Fld>
              <Fld label="Quantity (batch size)">
                <Input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Fld>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              Setup is charged once for the whole batch and divided across the quantity — so a larger
              order costs less per part.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Fld label="Tolerance">
                <select value={tolerance} onChange={(e) => setTolerance(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                  <option value="0.25">± 0.25 mm — loose</option>
                  <option value="0.125">± 0.125 mm — standard</option>
                  <option value="0.05">± 0.05 mm — close</option>
                  <option value="0.025">± 0.025 mm — precision (needs grinding)</option>
                  <option value="0.0125">± 0.0125 mm — ultra (grind + lap)</option>
                </select>
              </Fld>
              <Fld label="Surface finish">
                <select value={finishRa} onChange={(e) => setFinishRa(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                  <option value="6.3">Ra 6.3 µm — as milled</option>
                  <option value="3.2">Ra 3.2 µm — standard</option>
                  <option value="1.6">Ra 1.6 µm</option>
                  <option value="0.8">Ra 0.8 µm — fine</option>
                  <option value="0.2">Ra 0.2 µm — super fine (polish)</option>
                  <option value="0.1">Ra 0.1 µm — mirror (lap)</option>
                </select>
              </Fld>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              Tighter specs mean slower feeds and extra finishing passes, so they stretch cutting time.
              The larger of the two applies — they are not multiplied together.
            </p>

            <button type="button" onClick={() => setShowCosting((v) => !v)}
              className="text-xs font-medium text-red-700 hover:underline">
              {showCosting ? "− Hide" : "+ Add"} material, tooling &amp; overhead
            </button>
            {showCosting && (
              <div className="rounded-md border border-slate-200 p-3 space-y-3 bg-slate-50">
                <div className="grid grid-cols-2 gap-3">
                  <Fld label="Material (₹/kg)">
                    <Input type="number" min="0" value={matPrice} onChange={(e) => setMatPrice(e.target.value)}
                      placeholder="leave blank to skip" />
                  </Fld>
                  <Fld label="Scrap allowance %">
                    <Input type="number" min="0" value={scrapPct} onChange={(e) => setScrapPct(e.target.value)}
                      placeholder="0" />
                  </Fld>
                  <Fld label="Tool cost (₹)">
                    <Input type="number" min="0" value={toolCost} onChange={(e) => setToolCost(e.target.value)}
                      placeholder="leave blank to skip" />
                  </Fld>
                  <Fld label="Parts per tool">
                    <Input type="number" min="0" step="1" value={toolLife} onChange={(e) => setToolLife(e.target.value)}
                      placeholder="tool life" />
                  </Fld>
                </div>
                <Fld label="Overhead %">
                  <Input type="number" min="0" value={overheadPct} onChange={(e) => setOverheadPct(e.target.value)}
                    placeholder="0" />
                </Fld>
                <p className="text-[11px] text-slate-500">
                  Overhead applies to the machine cost only, never to material or bought-out tooling.
                  Leave it at 0 until you have confirmed whether your machine hourly rate already
                  includes factory overhead — otherwise it gets counted twice.
                </p>
                <p className="text-[11px] text-slate-500">
                  Material is costed on the billet, including what becomes swarf — not on the finished
                  part weight.
                </p>
              </div>
            )}
            <Button onClick={generate} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white w-full">
              {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generating…</> : "Generate Quote"}
            </Button>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{error}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            {!result ? (
              <div className="text-center py-16 text-slate-400 text-sm">Fill the form and generate a quote.</div>
            ) : (
              <div className="space-y-4">
                {result.warnings?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1">
                    {result.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
                        <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Geometry</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-slate-50 rounded-md p-2 text-center">
                      <div className="text-slate-400 text-[10px] uppercase">Bbox (mm)</div>
                      <div className="font-medium">
                        {result.geometry?.bbox_mm?.x}×{result.geometry?.bbox_mm?.y}×{result.geometry?.bbox_mm?.z}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2 text-center">
                      <div className="text-slate-400 text-[10px] uppercase">Volume</div>
                      <div className="font-medium">{result.geometry?.volume_cm3} cm³</div>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2 text-center">
                      <div className="text-slate-400 text-[10px] uppercase">To remove</div>
                      <div className="font-medium">{result.volume_to_remove_cm3} cm³</div>
                    </div>
                  </div>
                </div>

                {result.axis_analysis?.suggested_axes && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Suggested machining strategy</div>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <div className="text-sm font-semibold text-blue-800 mb-1">
                        {result.axis_analysis.suggested_axes}-axis
                        {result.axis_analysis.suggested_axes === 4 ? " (indexed 4th — e.g. a 4+1 machine)" : ""}
                        {result.axis_analysis.suggested_axes >= 5 ? " (simultaneous)" : ""}
                      </div>
                      <ul className="text-xs text-blue-700 list-disc pl-4 space-y-0.5">
                        {(result.axis_analysis.reasoning || []).map((r, i) => (<li key={i}>{r}</li>))}
                      </ul>
                      <div className="text-[11px] text-blue-600 mt-1.5">
                        Suggestion only, based on part geometry — you already picked the machine above; nothing is changed automatically.
                      </div>
                    </div>
                  </div>
                )}

                {result.holes?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Holes detected</div>
                    <table className="w-full text-sm">
                      <thead className="text-xs text-slate-400">
                        <tr><th className="text-left font-normal">Ø (mm)</th><th className="text-left font-normal">Count</th><th className="text-left font-normal">Est. depth (mm)</th></tr>
                      </thead>
                      <tbody>
                        {result.holes.map((h, i) => (
                          <tr key={i} className="border-t"><td className="py-1">{h.diameter_mm}</td><td>{h.count}</td><td>{h.est_depth_mm}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Time breakdown</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(result.time_breakdown_min || {}).map(([k, v]) => (
                        <tr key={k} className={k === "total" ? "border-t font-semibold" : "border-t"}>
                          <td className="py-1">{ROW_LABELS[k] || k}</td>
                          <td className="text-right">{v} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.turning_breakdown?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Turning operations</div>
                    <table className="w-full text-sm">
                      <thead className="text-xs text-slate-400">
                        <tr>
                          <th className="text-left font-normal">Op</th><th className="text-left font-normal">L (mm)</th>
                          <th className="text-left font-normal">Ø</th><th className="text-right font-normal">rpm</th>
                          <th className="text-right font-normal">Passes</th><th className="text-right font-normal">min</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.turning_breakdown.map((t, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1">{t.operation}</td><td>{t.length_mm}</td><td>{t.diameter_mm}</td>
                            <td className="text-right">{t.rpm}</td><td className="text-right">{t.passes}</td>
                            <td className="text-right">{t.minutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {result.spec_factors && result.spec_factors.applied_factor !== 1 && (
                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2">
                    <span className="font-medium">Spec uplift ×{result.spec_factors.applied_factor}</span>
                    {" — "}
                    {result.spec_factors.tolerance_factor >= result.spec_factors.finish_factor
                      ? result.spec_factors.tolerance_label
                      : result.spec_factors.finish_label}
                    {". Applied to cutting time only."}
                  </div>
                )}

                {result.cost_breakdown?.per_part ? (
                  <div className="border border-red-200 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {[["material", "Material"], ["machine", "Machine (incl. operator)"],
                          ["tooling", "Tooling"], ["overhead", "Overhead"]].map(([k, label]) => (
                          <tr key={k} className="border-b border-red-100">
                            <td className="py-1.5 px-3 text-slate-600">{label}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums">
                              ₹{(result.cost_breakdown.per_part[k] || 0).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="bg-red-50 p-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-red-800">
                        Cost per part
                        {result.cost_breakdown.qty > 1 && (
                          <span className="font-normal text-red-600"> · {result.cost_breakdown.qty} off</span>
                        )}
                      </span>
                      <span className="text-xl font-bold text-red-700">
                        ₹{result.cost_breakdown.per_part.total?.toLocaleString("en-IN")}
                      </span>
                    </div>
                    {result.cost_breakdown.qty > 1 && (
                      <div className="bg-red-50 border-t border-red-100 px-3 pb-3 flex items-center justify-between">
                        <span className="text-xs text-red-700">Batch total</span>
                        <span className="text-sm font-semibold text-red-700">
                          ₹{result.cost_breakdown.batch_total?.toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-red-800">Estimated cost</span>
                    <span className="text-xl font-bold text-red-700">₹{result.cost?.toLocaleString("en-IN")}</span>
                  </div>
                )}

                {result.cost_breakdown?.notes?.length > 0 && (
                  <ul className="text-[11px] text-slate-500 list-disc pl-4 space-y-0.5">
                    {result.cost_breakdown.notes.map((n, i) => (<li key={i}>{n}</li>))}
                  </ul>
                )}

                {result.assumptions?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Assumptions</div>
                    <ul className="text-xs text-slate-500 list-disc pl-4 space-y-0.5">
                      {result.assumptions.map((a, i) => (<li key={i}>{a}</li>))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
