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
const ROW_LABELS = { setup: "Setup", facing: "Facing", roughing: "Roughing", drilling: "Drilling", profile_finish: "Profile finish", total: "Total" };

export default function MachiningQuote() {
  const [machines, setMachines] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [material, setMaterial] = useState("");
  const [partName, setPartName] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const stepRef = useRef(null);

  useEffect(() => {
    api.get("/machines").then((r) => setMachines(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/machining/materials").then((r) => setMaterials(r.data?.materials || [])).catch(() => {});
  }, []);

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
      const r = await api.post("/machining/quote", {
        step_base64, machine_id: machineId, material,
        part_name: partName, hourly_rate: hourlyRate ? Number(hourlyRate) : undefined,
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
              <select value={machineId} onChange={(e) => setMachineId(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                <option value="">— Select machine —</option>
                {machines.map((m) => {
                  const axesLabel = m.axes
                    ? (m.simultaneous_axes && m.simultaneous_axes < m.axes
                        ? `(${m.simultaneous_axes}+${m.axes - m.simultaneous_axes})`
                        : `(${m.axes}-axis)`)
                    : "";
                  return (
                    <option key={m._id || m.id} value={m._id || m.id}>
                      {m.name} {axesLabel} {m.code ? `· ${m.code}` : ""}
                    </option>
                  );
                })}
              </select>
              {machines.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No machines set up yet — add one under Production → Machines first.</p>
              )}
            </Fld>
            <Fld label="Material">
              <select value={material} onChange={(e) => setMaterial(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-10">
                <option value="">— Select material —</option>
                {materials.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </Fld>
            <Fld label="Hourly rate (₹/hr)">
              <Input type="number" min="0" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="defaults to the machine's rate" />
            </Fld>
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

                <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-red-800">Estimated cost</span>
                  <span className="text-xl font-bold text-red-700">₹{result.cost?.toLocaleString("en-IN")}</span>
                </div>

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
