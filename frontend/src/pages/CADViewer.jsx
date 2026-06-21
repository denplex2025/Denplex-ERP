import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Box, Loader2, Rotate3d } from "lucide-react";
import { toast } from "sonner";

const O3DV_SRC = "https://cdn.jsdelivr.net/npm/online-3d-viewer@0.18.0/build/engine/o3dv.min.js";
const MESH_EXT = ["stl", "obj", "gltf", "glb", "3mf", "ply", "off", "fbx", "3ds"];
const fileToB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

export default function CADViewer() {
  const [ovReady, setOvReady] = useState(!!window.OV);
  const [busy, setBusy] = useState(false);
  const [geom, setGeom] = useState(null);
  const [info, setInfo] = useState("");
  const parentRef = useRef(null);
  const viewerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (window.OV) { setOvReady(true); return; }
    const s = document.createElement("script");
    s.src = O3DV_SRC; s.async = true;
    s.onload = () => setOvReady(true);
    s.onerror = () => toast.error("Couldn't load the 3D viewer library.");
    document.body.appendChild(s);
  }, []);

  const render = (files) => {
    const OV = window.OV;
    if (!OV || !parentRef.current) return;
    try { if (viewerRef.current && viewerRef.current.Destroy) viewerRef.current.Destroy(); } catch (e) { /* ignore */ }
    parentRef.current.innerHTML = "";
    const viewer = new OV.EmbeddedViewer(parentRef.current, {
      backgroundColor: new OV.RGBAColor(247, 248, 250, 255),
      defaultColor: new OV.RGBColor(140, 150, 165),
      edgeSettings: new OV.EdgeSettings(true, new OV.RGBColor(45, 45, 55), 1),
    });
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    viewer.LoadModelFromFileList(dt.files);
    viewerRef.current = viewer;
  };

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGeom(null); setInfo("");
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (MESH_EXT.includes(ext)) {
      setInfo(`${file.name}`);
      render([file]);
      return;
    }
    if (ext === "step" || ext === "stp" || ext === "iges" || ext === "igs") {
      setBusy(true);
      try {
        const b64 = await fileToB64(file);
        const r = await api.post("/cad/glb", { step_base64: b64 });
        const mesh = r.data?.mesh_base64;
        const fmt = r.data?.mesh_format || "stl";
        setGeom(r.data?.geometry || null);
        if (!mesh) { toast.error("Couldn't convert this STEP to 3D. The geometry summary may still be available below."); setBusy(false); return; }
        const bytes = Uint8Array.from(atob(mesh), (c) => c.charCodeAt(0));
        const meshFile = new File([bytes], `model.${fmt}`, { type: "application/octet-stream" });
        setInfo(`${file.name} (converted from STEP)`);
        render([meshFile]);
      } catch (err) {
        toast.error(err?.response?.status === 503 ? "CAD viewer not configured (set CAD_SERVICE_URL)." : "Could not convert STEP — check the CAD service.");
      }
      setBusy(false);
      return;
    }
    toast.error("Unsupported file type.");
  };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Box className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">3D CAD Viewer</h1>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">open-source</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">View part files in 3D — <strong>STEP / IGES</strong> (converted via the CAD service) and mesh formats (<strong>STL, OBJ, GLTF/GLB, 3MF</strong>) directly. Drag to rotate, scroll to zoom.</p>

      <div className="flex flex-wrap items-end gap-3 mb-4 bg-slate-50 border border-slate-200 rounded-md p-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wider text-slate-500">3D file</Label>
          <input ref={inputRef} type="file" accept=".step,.stp,.iges,.igs,.stl,.obj,.gltf,.glb,.3mf,.ply,.off" onChange={onPick} disabled={!ovReady || busy} className="mt-1 text-xs block w-72" />
        </div>
        {!ovReady && <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> loading viewer…</span>}
        {busy && <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> converting STEP…</span>}
        {info && <span className="text-xs text-slate-500">{info}</span>}
      </div>

      <div ref={parentRef} className="w-full h-[60vh] border border-slate-200 rounded-md bg-slate-50 relative">
        {!info && !busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-sm gap-2 pointer-events-none">
            <Rotate3d className="h-8 w-8" />
            <div>Pick a 3D file to view it here.</div>
          </div>
        )}
      </div>

      {geom && (geom.bbox_mm || geom.volume_cm3) && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          {geom.bbox_mm && <span>Size: <strong className="text-slate-700">{geom.bbox_mm.x} × {geom.bbox_mm.y} × {geom.bbox_mm.z} mm</strong></span>}
          {geom.volume_cm3 != null && <span>Volume: <strong className="text-slate-700">{geom.volume_cm3} cm³</strong></span>}
          {geom.cylindrical_faces != null && <span>Cylindrical faces: <strong className="text-slate-700">{geom.cylindrical_faces}</strong></span>}
          {geom.hole_or_round_diameters_mm && <span>Ø: <strong className="text-slate-700">{geom.hole_or_round_diameters_mm.join(", ")} mm</strong></span>}
        </div>
      )}
    </div>
  );
}
