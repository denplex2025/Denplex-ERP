import { useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera } from "lucide-react";
import { toast } from "sonner";

const fileToB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const blankDim = () => ({ label: "", nominal: "", actual: "", result: "PASS" });
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function WorkerQC() {
  const [f, setF] = useState({ part_name: "", part_number: "", drawing_name: "", supplier_name: "", inspection_date: todayStr() });
  const [dims, setDims] = useState([blankDim()]);
  const [photo, setPhoto] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const camRef = useRef(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setDim = (i, k, v) => setDims((d) => d.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (file) { setPhotoFile(file); setPhoto(await fileToB64(file)); }
  };

  const save = async () => {
    if (!f.part_name.trim()) { toast.error("Part name is required"); return; }
    setSaving(true);
    try {
      const payload = { ...f, dimensions: dims.filter((d) => d.label.trim()).map((d) => ({ label: d.label, nominal: d.nominal, actual: d.actual, result: d.result })) };
      const r = await api.post("/qc-inspections", payload);
      const id = r.data?.id || r.data?._id;
      if (photoFile && id) {
        try {
          const fd = new FormData();
          fd.append("file", photoFile);
          await api.post(`/qc-inspections/${id}/drawing`, fd);
        } catch (e) { /* photo optional */ }
      }
      toast.success(`QC saved${r.data?.code ? " · " + r.data.code : ""}`);
      setF({ part_name: "", part_number: "", drawing_name: "", supplier_name: "", inspection_date: todayStr() });
      setDims([blankDim()]); setPhoto(""); setPhotoFile(null);
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setSaving(false);
  };

  return (
    <div>
      <h1 className="text-lg font-bold font-display mb-3">QC Entry</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <Fld label="Part name *"><Input value={f.part_name} onChange={(e) => set("part_name", e.target.value)} className="h-11" /></Fld>
        <div className="grid grid-cols-2 gap-2">
          <Fld label="Part number"><Input value={f.part_number} onChange={(e) => set("part_number", e.target.value)} className="h-11" /></Fld>
          <Fld label="Date"><Input type="date" value={f.inspection_date} onChange={(e) => set("inspection_date", e.target.value)} className="h-11" /></Fld>
        </div>
        <Fld label="Drawing no"><Input value={f.drawing_name} onChange={(e) => set("drawing_name", e.target.value)} className="h-11" /></Fld>
        <Fld label="Supplier"><Input value={f.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} className="h-11" /></Fld>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Measured dimensions</div>
          {dims.map((d, i) => (
            <div key={i} className="flex gap-1.5 mb-1.5 items-center">
              <Input placeholder="Dimension" value={d.label} onChange={(e) => setDim(i, "label", e.target.value)} className="h-10 flex-1" />
              <Input placeholder="Nom" value={d.nominal} onChange={(e) => setDim(i, "nominal", e.target.value)} className="h-10 w-14" />
              <Input placeholder="Act" value={d.actual} onChange={(e) => setDim(i, "actual", e.target.value)} className="h-10 w-14" />
              <select value={d.result} onChange={(e) => setDim(i, "result", e.target.value)} className={`h-10 rounded-md border border-slate-200 text-xs px-1 bg-white font-semibold ${d.result === "PASS" ? "text-emerald-700" : "text-red-600"}`}>
                <option>PASS</option><option>FAIL</option>
              </select>
            </div>
          ))}
          <button onClick={() => setDims((d) => [...d, blankDim()])} className="text-xs text-red-600">+ Add dimension</button>
        </div>

        <div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
          <Button variant="outline" onClick={() => camRef.current?.click()} className="w-full h-11 rounded-lg"><Camera className="h-4 w-4 mr-1" /> {photo ? "Retake photo" : "Take photo"}</Button>
          {photo && <img src={photo} alt="qc" className="mt-2 rounded-lg w-full max-h-48 object-cover border border-slate-200" />}
        </div>

        <Button onClick={save} disabled={saving} className="w-full h-12 rounded-lg bg-red-600 hover:bg-red-700 text-base">{saving ? "Saving…" : "Save QC"}</Button>
      </div>
    </div>
  );
}

const Fld = ({ label, children }) => (<div><label className="text-[11px] uppercase tracking-wider text-slate-500">{label}</label><div className="mt-1">{children}</div></div>);
