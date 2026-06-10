import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import { Plus, Trash2, X, ImageIcon, Download, DownloadCloud, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function QC() {
  return (
    <div data-testid="qc-page">
      <PageHeader
        overline="Quality" title="QC Reports"
        subtitle="Parameter inspections + dimensional inspections for full coverage."
      />
      <Tabs defaultValue="parameter" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="parameter">Parameter Inspections</TabsTrigger>
          <TabsTrigger value="dimensional">Dimensional Inspections</TabsTrigger>
        </TabsList>

        <TabsContent value="parameter">
          <ParameterQC />
        </TabsContent>

        <TabsContent value="dimensional">
          <DimensionalQC />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// TAB 1: PARAMETER INSPECTIONS (existing code)
// ============================================================================
function ParameterQC() {
  const [items, setItems] = useState([]);
  const [wos, setWos] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ result: "pass", photos: [] });

  const load = async () => {
    const [a, b] = await Promise.all([api.get("/qc-reports"), api.get("/work-orders")]);
    setItems(a.data); setWos(b.data);
  };
  useEffect(() => { load(); }, []);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const addPhoto = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setForm(p => ({ ...p, photos: [...(p.photos || []), r.result] }));
    r.readAsDataURL(f);
  };

  const save = async () => {
    try {
      await api.post("/qc-reports", form);
      toast.success("QC report saved"); setOpen(false); setForm({ result: "pass", photos: [] }); load();
    } catch (e) { toast.error("Failed"); }
  };
  const del = async (r) => { if (!window.confirm("Delete?")) return; await api.delete(`/qc-reports/${r.id}`); load(); };

  return (
    <div>
      <div className="mb-4">
        <Button onClick={()=>{setForm({result:"pass",photos:[],inspection_date:new Date().toISOString().slice(0,10)}); setOpen(true);}} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="new-qc"><Plus className="h-4 w-4 mr-1" /> New Parameter QC</Button>
      </div>
      <Card>
        {items.length === 0 ? <Empty label="No QC reports yet." /> : (
          <table className="w-full">
            <thead><tr><Th>Code</Th><Th>WO</Th><Th>Inspector</Th><Th>Parameter</Th><Th>Spec</Th><Th>Measured</Th><Th>Result</Th><Th>Photos</Th><Th>Date</Th><Th></Th></tr></thead>
            <tbody>
              {items.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="font-mono-tech text-xs">{r.code}</Td>
                  <Td className="font-mono-tech text-xs">{r.work_order_code || "—"}</Td>
                  <Td>{r.inspector}</Td>
                  <Td>{r.parameter}</Td>
                  <Td className="text-slate-500">{r.spec}</Td>
                  <Td>{r.measured}</Td>
                  <Td><StatusBadge status={r.result} /></Td>
                  <Td>{r.photos?.length ? <span className="inline-flex items-center text-xs text-slate-600"><ImageIcon className="h-3 w-3 mr-1" />{r.photos.length}</span> : "—"}</Td>
                  <Td>{fmtDate(r.inspection_date)}</Td>
                  <Td className="text-right"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>del(r)}><Trash2 className="h-4 w-4 text-red-600" /></Button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl">
          <DialogHeader><DialogTitle className="font-display">New QC Report</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Work Order">
              <Select value={form.work_order_id || ""} onValueChange={v=>setF("work_order_id", v)}>
                <SelectTrigger className="rounded-sm" data-testid="qc-wo"><SelectValue placeholder="Select WO" /></SelectTrigger>
                <SelectContent>{wos.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.product}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Inspector"><Input value={form.inspector || ""} onChange={e=>setF("inspector", e.target.value)} /></Field>
            <Field label="Parameter *"><Input value={form.parameter || ""} onChange={e=>setF("parameter", e.target.value)} data-testid="qc-param" /></Field>
            <Field label="Spec"><Input value={form.spec || ""} onChange={e=>setF("spec", e.target.value)} placeholder="e.g. 25.00 ± 0.02 mm" /></Field>
            <Field label="Measured"><Input value={form.measured || ""} onChange={e=>setF("measured", e.target.value)} /></Field>
            <Field label="Result">
              <Select value={form.result || "pass"} onValueChange={v=>setF("result", v)}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="rework">Rework</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Inspection Date"><Input type="date" value={(form.inspection_date || "").slice(0,10)} onChange={e=>setF("inspection_date", e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Notes"><Textarea rows={2} value={form.notes || ""} onChange={e=>setF("notes", e.target.value)} /></Field></div>
            <div className="col-span-2">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Photos</Label>
              <input type="file" accept="image/*" onChange={addPhoto} className="block mt-1.5 text-sm" data-testid="qc-photo-input" />
              <div className="flex gap-2 mt-2 flex-wrap">
                {(form.photos || []).map((p, i) => (
                  <div key={i} className="relative h-20 w-20 border border-slate-200">
                    <img src={p} alt="" className="w-full h-full object-cover" />
                    <button className="absolute top-0 right-0 bg-white p-0.5" onClick={()=>setF("photos", form.photos.filter((_,j)=>j!==i))}><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-qc">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// TAB 2: DIMENSIONAL INSPECTIONS (new system with PDF/Excel export)
// ============================================================================
function DimensionalQC() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    part_name: "",
    part_number: "",
    drawing_name: "",
    supplier_name: "",
    inspection_date: new Date().toISOString().slice(0, 10),
    inspector_name: "",
    dimensions: [],
    samples: [],
    overall_result: "pending",
  });
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const res = await api.get("/qc-inspections");
      setItems(res.data || []);
    } catch (e) {
      toast.error("Failed to load inspections");
    }
  };

  useEffect(() => { load(); }, []);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setDim = (i, k, v) => {
    const dims = [...(form.dimensions || [])];
    dims[i] = { ...dims[i], [k]: v };
    setForm(p => ({ ...p, dimensions: dims }));
  };
  const setSample = (i, k, v) => {
    const samples = [...(form.samples || [])];
    samples[i] = { ...samples[i], [k]: v };
    setForm(p => ({ ...p, samples }));
  };
  const setMeasurement = (sampleIdx, dimIdx, val) => {
    const samples = [...(form.samples || [])];
    if (!samples[sampleIdx].measurements) samples[sampleIdx].measurements = [];
    const meas = [...(samples[sampleIdx].measurements || [])];
    meas[dimIdx] = val === "" ? null : parseFloat(val) || null;
    samples[sampleIdx].measurements = meas;
    setForm(p => ({ ...p, samples }));
  };

  const addDimension = () => {
    setForm(p => ({
      ...p,
      dimensions: [...(p.dimensions || []), { label: "", nominal: null, tol_upper: null, tol_lower: null, unit: "mm", raw_spec: "" }],
    }));
  };

  const removeDimension = (i) => {
    setForm(p => ({
      ...p,
      dimensions: (p.dimensions || []).filter((_, idx) => idx !== i),
      samples: (p.samples || []).map(s => ({ ...s, measurements: (s.measurements || []).filter((_, idx) => idx !== i) })),
    }));
  };

  const initSamples = () => {
    const samples = [];
    for (let i = 1; i <= 10; i++) {
      samples.push({
        sample_no: i,
        measurements: new Array(form.dimensions?.length || 0).fill(null),
        result: "",
        sign: "",
        note: "",
      });
    }
    setForm(p => ({ ...p, samples }));
  };

  const extractFromDrawing = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const tid = toast.loading("Reading drawing with AI\u2026");
    try {
      const res = await api.post("/qc-inspections/extract-dimensions", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const dims = res.data?.dimensions || [];
      if (!dims.length) { toast.error("No dimensions found in the drawing"); }
      else {
        setForm((p) => ({ ...p, dimensions: dims, samples: [] }));
        toast.success("Extracted " + dims.length + " dimension(s)");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Extraction failed");
    } finally {
      toast.dismiss(tid);
      if (e.target) e.target.value = "";
    }
  };

  const autoValidate = () => {
    const dims = form.dimensions || [];
    let anyFail = false, anyMeasured = false;
    const samples = (form.samples || []).map((s) => {
      const meas = s.measurements || [];
      let hasVal = false, fail = false;
      dims.forEach((d, i) => {
        const m = meas[i];
        if (m === null || m === undefined || m === "") return;
        hasVal = true;
        const nom = d.nominal, tu = d.tol_upper, tl = d.tol_lower;
        if (nom != null && tu != null && tl != null) {
          if (m > nom + tu || m < nom + tl) fail = true;
        }
      });
      if (hasVal) { anyMeasured = true; if (fail) anyFail = true; return { ...s, result: fail ? "fail" : "pass" }; }
      return s;
    });
    setForm((p) => ({ ...p, samples, overall_result: anyMeasured ? (anyFail ? "fail" : "pass") : "pending" }));
    toast.success("Auto pass/fail applied");
  };

  const save = async () => {
    if (!form.part_name) {
      toast.error("Part name required");
      return;
    }
    if (!form.dimensions || form.dimensions.length === 0) {
      toast.error("Add at least one dimension");
      return;
    }
    try {
      if (editId) {
        await api.put(`/qc-inspections/${editId}`, form);
        toast.success("Inspection updated");
      } else {
        await api.post("/qc-inspections", form);
        toast.success("Inspection created");
      }
      setOpen(false);
      setEditId(null);
      setForm({
        part_name: "",
        part_number: "",
        drawing_name: "",
        supplier_name: "",
        inspection_date: new Date().toISOString().slice(0, 10),
        inspector_name: "",
        dimensions: [],
        samples: [],
        overall_result: "pending",
      });
      load();
    } catch (e) {
      toast.error("Failed to save");
    }
  };

  const edit = (item) => {
    setEditId(item._id || item.id);
    setForm(item);
    setOpen(true);
  };

  const del = async (item) => {
    if (!window.confirm("Delete this inspection?")) return;
    try {
      await api.delete(`/qc-inspections/${item._id || item.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  const exportPdf = async (item) => {
    try {
      const res = await api.get(`/qc-inspections/${item._id || item.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qc-${item.code || item._id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Failed to export PDF");
    }
  };

  const exportXlsx = async (item) => {
    try {
      const res = await api.get(`/qc-inspections/${item._id || item.id}/xlsx`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qc-${item.code || item._id}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Failed to export Excel");
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Button
          onClick={() => {
            setEditId(null);
            setForm({
              part_name: "",
              part_number: "",
              drawing_name: "",
              supplier_name: "",
              inspection_date: new Date().toISOString().slice(0, 10),
              inspector_name: "",
              dimensions: [],
              samples: [],
              overall_result: "pending",
            });
            setOpen(true);
          }}
          className="rounded-sm bg-red-600 hover:bg-red-700"
        >
          <Plus className="h-4 w-4 mr-1" /> New Dimensional QC
        </Button>
      </div>

      <Card>
        {items.length === 0 ? (
          <Empty label="No dimensional inspections yet." />
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Part Name</Th>
                <Th>Drawing</Th>
                <Th>Inspector</Th>
                <Th>Date</Th>
                <Th>Overall Result</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id || item.id} className="hover:bg-slate-50">
                  <Td className="font-mono-tech text-xs">{item.code || "—"}</Td>
                  <Td>{item.part_name}</Td>
                  <Td className="text-xs">{item.drawing_name || "—"}</Td>
                  <Td>{item.inspector_name || "—"}</Td>
                  <Td>{fmtDate(item.inspection_date)}</Td>
                  <Td>
                    <StatusBadge status={item.overall_result} />
                  </Td>
                  <Td className="text-right flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => exportPdf(item)} title="PDF">
                      <Download className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => exportXlsx(item)} title="Excel">
                      <DownloadCloud className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => edit(item)}>
                      ✎
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(item)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editId ? "Edit Dimensional QC" : "New Dimensional QC Inspection"}
            </DialogTitle>
          </DialogHeader>

          {/* Header Section */}
          <div className="grid grid-cols-3 gap-3 border-b pb-3 mb-3">
            <Field label="Part Name *">
              <Input value={form.part_name || ""} onChange={(e) => setF("part_name", e.target.value)} />
            </Field>
            <Field label="Part Number">
              <Input value={form.part_number || ""} onChange={(e) => setF("part_number", e.target.value)} />
            </Field>
            <Field label="Drawing Name">
              <Input value={form.drawing_name || ""} onChange={(e) => setF("drawing_name", e.target.value)} />
            </Field>
            <Field label="Supplier">
              <Input value={form.supplier_name || ""} onChange={(e) => setF("supplier_name", e.target.value)} />
            </Field>
            <Field label="Inspection Date">
              <Input type="date" value={form.inspection_date || ""} onChange={(e) => setF("inspection_date", e.target.value)} />
            </Field>
            <Field label="Inspector">
              <Input value={form.inspector_name || ""} onChange={(e) => setF("inspector_name", e.target.value)} />
            </Field>
          </div>

          {/* Dimensions Section */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <Label className="font-semibold">Dimensions / Parameters</Label>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept=".pdf,image/*" hidden onChange={extractFromDrawing} />
                <Button size="sm" variant="outline" className="rounded-sm" onClick={() => fileRef.current?.click()}
                  title="Extract dimensions from an engineering drawing using AI">
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-red-600" /> Extract from Drawing (AI)
                </Button>
                <Button size="sm" onClick={addDimension} className="rounded-sm bg-slate-200 text-slate-900 hover:bg-slate-300">
                  + Add Dimension
                </Button>
              </div>
            </div>
            {(!form.dimensions || form.dimensions.length === 0) ? (
              <p className="text-sm text-slate-500">No dimensions added yet.</p>
            ) : (
              <div className="grid grid-cols-5 gap-2 mb-2">
                {form.dimensions.map((dim, i) => (
                  <div key={i} className="col-span-5 grid grid-cols-5 gap-2 p-2 border rounded bg-slate-50">
                    <Field label="Label">
                      <Input
                        size="sm"
                        value={dim.label || ""}
                        onChange={(e) => setDim(i, "label", e.target.value)}
                        placeholder="e.g. 250, Ø130 H7"
                      />
                    </Field>
                    <Field label="Nominal">
                      <Input
                        size="sm"
                        type="number"
                        step="0.01"
                        value={dim.nominal || ""}
                        onChange={(e) => setDim(i, "nominal", e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </Field>
                    <Field label="Tol Upper">
                      <Input
                        size="sm"
                        type="number"
                        step="0.01"
                        value={dim.tol_upper || ""}
                        onChange={(e) => setDim(i, "tol_upper", e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </Field>
                    <Field label="Tol Lower">
                      <Input
                        size="sm"
                        type="number"
                        step="0.01"
                        value={dim.tol_lower || ""}
                        onChange={(e) => setDim(i, "tol_lower", e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </Field>
                    <div className="flex items-end gap-2">
                      <Button size="sm" variant="outline" className="rounded-sm" onClick={() => removeDimension(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Samples Section */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <Label className="font-semibold">Sample Measurements (up to 10)</Label>
              <div className="flex items-center gap-2">
                {form.samples && form.samples.length > 0 && (
                  <Button size="sm" variant="outline" className="rounded-sm" onClick={autoValidate}
                    title="Compare every measurement to its tolerance and set pass/fail automatically">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Auto Pass/Fail
                  </Button>
                )}
                {form.samples && form.samples.length === 0 && (
                  <Button size="sm" onClick={initSamples} className="rounded-sm bg-slate-200 text-slate-900 hover:bg-slate-300">
                    Initialize 10 Samples
                  </Button>
                )}
              </div>
            </div>

            {form.samples && form.samples.length > 0 && (
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b">
                      <th className="p-1.5 text-left font-semibold">Sample #</th>
                      {form.dimensions?.map((dim, i) => (
                        <th key={i} className="p-1.5 text-center font-semibold whitespace-nowrap">
                          {dim.label}
                        </th>
                      ))}
                      <th className="p-1.5 text-center font-semibold">Result</th>
                      <th className="p-1.5 text-center font-semibold">Sign</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.samples.map((sample, sIdx) => (
                      <tr key={sIdx} className="border-b hover:bg-slate-50">
                        <td className="p-1.5 font-mono text-slate-600">{sample.sample_no}</td>
                        {form.dimensions?.map((dim, dIdx) => (
                          <td key={dIdx} className="p-1.5">
                            <Input
                              type="number"
                              step="0.01"
                              size="sm"
                              value={
                                sample.measurements && sample.measurements[dIdx] !== undefined
                                  ? sample.measurements[dIdx] === null
                                    ? ""
                                    : sample.measurements[dIdx]
                                  : ""
                              }
                              onChange={(e) => setMeasurement(sIdx, dIdx, e.target.value)}
                              className="h-7 p-1 rounded-sm text-center"
                            />
                          </td>
                        ))}
                        <td className="p-1.5">
                          <Select value={sample.result || ""} onValueChange={(v) => setSample(sIdx, "result", v)}>
                            <SelectTrigger className="h-7 rounded-sm text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">—</SelectItem>
                              <SelectItem value="pass">Pass</SelectItem>
                              <SelectItem value="fail">Fail</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-1.5">
                          <Input
                            size="sm"
                            value={sample.sign || ""}
                            onChange={(e) => setSample(sIdx, "sign", e.target.value)}
                            placeholder="Initials"
                            className="h-7 p-1 rounded-sm"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Overall Result */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Overall Result">
              <Select value={form.overall_result || "pending"} onValueChange={(v) => setF("overall_result", v)}>
                <SelectTrigger className="rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700">
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label>
    <div className="mt-1">{children}</div>
  </div>
);
