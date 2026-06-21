import { useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Download, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

const FIXTURE_TYPES = ["(let AI recommend)", "Milling / Machining fixture", "Drilling jig", "Turning fixture",
  "Welding jig / fixture", "Assembly fixture", "Hydraulic machining fixture", "Pneumatic fixture",
  "Leak-test fixture", "Inspection / checking fixture", "BIW fixture"];
const OPERATIONS = ["", "Milling (VMC)", "Turning", "Drilling", "Grinding", "Welding", "Assembly", "Inspection", "Leak test"];

const fileToB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const Fld = ({ label, children }) => (<div><Label className="text-[11px] uppercase tracking-wider text-slate-500">{label}</Label><div className="mt-1">{children}</div></div>);

export default function FixtureConcept() {
  const [f, setF] = useState({ part_name: "", material: "", fixture_type: FIXTURE_TYPES[0], operation: "", machine: "", qty: 1, datums: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [concept, setConcept] = useState(null);
  const [dims, setDims] = useState(null);
  const [raw, setRaw] = useState("");
  const [sketchSvg, setSketchSvg] = useState("");
  const [sketching, setSketching] = useState(false);
  const [lastImg, setLastImg] = useState({ b64: "", mime: "" });
  const imgRef = useRef(null);
  const stlRef = useRef(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const generate = async () => {
    const img = imgRef.current?.files?.[0];
    const stl = stlRef.current?.files?.[0];
    if (!img && !stl && !f.part_name) { toast.error("Upload a drawing/3D file or at least enter a part name"); return; }
    setBusy(true); setConcept(null); setRaw(""); setSketchSvg("");
    try {
      const payload = { ...f, qty: Number(f.qty) || 1, fixture_type: f.fixture_type.startsWith("(") ? "" : f.fixture_type };
      if (img) { payload.image_base64 = await fileToB64(img); payload.mime = img.type || "image/png"; }
      if (stl) {
        const b64 = await fileToB64(stl);
        const nm = (stl.name || "").toLowerCase();
        if (nm.endsWith(".step") || nm.endsWith(".stp")) payload.step_base64 = b64; else payload.stl_base64 = b64;
      }
      setLastImg({ b64: payload.image_base64 || "", mime: payload.mime || "image/png" });
      const r = await api.post("/fixture/concept", payload);
      setConcept(r.data?.concept || null);
      setDims(r.data?.dims || null);
      if (!r.data?.concept) setRaw(r.data?.raw || "No structured result.");
      else toast.success("Concept ready");
    } catch (e) {
      toast.error(e?.response?.status === 503 ? "Set ANTHROPIC_API_KEY in Railway → Variables." : (e?.response?.data?.detail || "Generation failed"));
    }
    setBusy(false);
  };

  const genSketch = async () => {
    if (!concept) return;
    setSketching(true);
    try {
      const r = await api.post("/fixture/sketch", { concept, part_name: f.part_name, material: f.material, dims, image_base64: lastImg.b64, mime: lastImg.mime });
      if (r.data?.svg) setSketchSvg(r.data.svg); else toast.error("Couldn't produce a sketch — try again.");
    } catch (e) { toast.error("Sketch failed"); }
    setSketching(false);
  };

  const svgToPng = (svg) => new Promise((resolve) => {
    try {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width || 900; cv.height = im.height || 580;
        const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0);
        URL.revokeObjectURL(url); resolve(cv.toDataURL("image/png"));
      };
      im.onerror = () => { URL.revokeObjectURL(url); resolve(""); };
      im.src = url;
    } catch (e) { resolve(""); }
  });

  const downloadSvg = () => {
    if (!sketchSvg) return;
    const url = URL.createObjectURL(new Blob([sketchSvg], { type: "image/svg+xml" }));
    const a = document.createElement("a"); a.href = url; a.download = `FixtureSketch_${f.part_name || "part"}.svg`; a.click(); URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!concept) return;
    try {
      const sketch_png_base64 = sketchSvg ? await svgToPng(sketchSvg) : "";
      const r = await api.post("/fixture/concept/pdf", { concept, meta: { part_name: f.part_name }, sketch_png_base64 }, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a"); a.href = url; a.download = `FixtureConcept_${f.part_name || "part"}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error("PDF failed"); }
  };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">AI Fixture Concept Generator</h1>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">beta</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">Upload a part drawing/photo and/or a 3D STL, add a few details, and get a first-draft jig &amp; fixture concept brief.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Inputs */}
        <div className="border border-slate-200 rounded-md p-4 space-y-3 h-fit">
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Drawing / Photo (PDF or image)"><input ref={imgRef} type="file" accept=".pdf,image/*" className="text-xs block w-full" /></Fld>
            <Fld label="3D model (STL / STEP)"><input ref={stlRef} type="file" accept=".stl,.step,.stp" className="text-xs block w-full" /></Fld>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Part name"><Input value={f.part_name} onChange={e => set("part_name", e.target.value)} /></Fld>
            <Fld label="Material"><Input value={f.material} onChange={e => set("material", e.target.value)} placeholder="EN24, SS304, MS…" /></Fld>
          </div>
          <Fld label="Target fixture type">
            <select value={f.fixture_type} onChange={e => set("fixture_type", e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
              {FIXTURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Fld>
          <div className="grid grid-cols-3 gap-3">
            <Fld label="Operation">
              <select value={f.operation} onChange={e => set("operation", e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
                {OPERATIONS.map(t => <option key={t} value={t}>{t || "—"}</option>)}
              </select>
            </Fld>
            <Fld label="Machine"><Input value={f.machine} onChange={e => set("machine", e.target.value)} placeholder="VMC…" /></Fld>
            <Fld label="Batch qty"><Input type="number" value={f.qty} onChange={e => set("qty", e.target.value)} /></Fld>
          </div>
          <Fld label="Datums / critical features"><Textarea rows={2} value={f.datums} onChange={e => set("datums", e.target.value)} placeholder="e.g. locate on bottom face + 2 bores; hold ±0.02 on top profile" /></Fld>
          <Fld label="Extra notes"><Textarea rows={2} value={f.notes} onChange={e => set("notes", e.target.value)} /></Fld>
          <Button onClick={generate} disabled={busy} className="w-full rounded-sm bg-red-600 hover:bg-red-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />} Generate Concept
          </Button>
          {dims && <div className="text-[11px] text-slate-400">STL envelope: {dims.x} × {dims.y} × {dims.z} mm</div>}
        </div>

        {/* Output */}
        <div className="border border-slate-200 rounded-md p-4 min-h-[300px]">
          {!concept && !raw && <div className="text-slate-400 text-sm flex items-center justify-center h-full">The fixture concept brief will appear here.</div>}
          {raw && <pre className="text-xs whitespace-pre-wrap text-slate-600">{raw}</pre>}
          {concept && <Brief c={concept} onPdf={downloadPdf} />}
          {concept && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Concept sketch (schematic)</div>
                <div className="flex gap-2">
                  {sketchSvg && <Button onClick={downloadSvg} variant="outline" size="sm" className="rounded-sm"><Download className="h-4 w-4 mr-1" /> SVG</Button>}
                  <Button onClick={genSketch} disabled={sketching} variant="outline" size="sm" className="rounded-sm">{sketching ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wrench className="h-4 w-4 mr-1" />}{sketchSvg ? "Regenerate" : "Generate sketch"}</Button>
                </div>
              </div>
              {sketchSvg
                ? <div className="border border-slate-200 rounded bg-white overflow-auto [&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: sketchSvg }} />
                : <div className="text-xs text-slate-400">Click "Generate sketch" for a labelled top + front view concept (schematic, not a manufacturing drawing).</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Bul = ({ title, items }) => {
  const arr = (items || []).filter(x => String(x).trim());
  if (!arr.length) return null;
  return (<div className="mb-3"><div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{title}</div>
    <ul className="list-disc pl-5 text-sm text-slate-700 space-y-0.5">{arr.map((x, i) => <li key={i}>{String(x)}</li>)}</ul></div>);
};

function Brief({ c, onPdf }) {
  const eb = c.estimated_build || {};
  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold text-slate-800 text-base">{c.fixture_type || "Fixture Concept"}</div>
          {c.summary && <div className="text-slate-600 mt-1">{c.summary}</div>}
        </div>
        <Button onClick={onPdf} variant="outline" size="sm" className="rounded-sm shrink-0"><Download className="h-4 w-4 mr-1" /> PDF</Button>
      </div>
      {c.locating_scheme && <div className="mb-3"><div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Locating scheme (3-2-1)</div><div className="text-slate-700">{c.locating_scheme}</div></div>}
      <Bul title="Locators" items={c.locators} />
      <Bul title="Clamping" items={c.clamping} />
      <Bul title="Supports" items={c.supports} />
      {c.base_plate && <div className="mb-3"><div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Base plate</div><div className="text-slate-700">{c.base_plate}</div></div>}
      {c.actuation && <div className="mb-3"><div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Actuation</div><div className="text-slate-700">{c.actuation}</div></div>}
      {(c.standard_components || []).length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Standard components (BOM)</div>
          <table className="w-full text-xs border border-slate-200 rounded">
            <thead><tr className="bg-slate-100 text-left"><th className="p-1.5">Item</th><th className="p-1.5 w-12">Qty</th><th className="p-1.5">Note</th></tr></thead>
            <tbody>{c.standard_components.map((x, i) => <tr key={i} className="border-t border-slate-100"><td className="p-1.5">{x.item}</td><td className="p-1.5">{x.qty}</td><td className="p-1.5 text-slate-500">{x.note}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <Bul title="Access & clearance" items={c.access_and_clearance} />
      <Bul title="Distortion / risks" items={c.distortion_risks} />
      <Bul title="Inspection points" items={c.inspection_points} />
      {(eb.cost_inr || eb.time_days) && <div className="text-sm text-slate-700 border-t border-slate-200 pt-2 mt-2">Estimated build: <strong>₹{eb.cost_inr ?? "—"}</strong> · {eb.time_days ?? "—"} days</div>}
      {c.assumptions && <div className="text-[11px] text-slate-400 mt-2">{c.assumptions}</div>}
      <div className="text-[11px] text-slate-400 mt-3">AI-generated concept — engineer review required before design release.</div>
    </div>
  );
}
