import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/erp/Primitives";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/erp/StatusBadge";
import { toast } from "sonner";
import { QrCode, ArrowRight, Loader2, Factory, Cog, Boxes, Play, Check, Pause, Camera, Image as ImageIcon } from "lucide-react";

const ENTITY_META = {
  "work-order": { label: "Work Order", icon: Factory, to: "/app/work-orders" },
  "part":       { label: "Part",       icon: Cog,     to: "/app/parts" },
  "inventory":  { label: "Inventory Item", icon: Boxes, to: "/app/inventory" },
};

const Row = ({ k, v }) => (v === undefined || v === null || v === "" ? null : (
  <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 text-sm">
    <span className="text-slate-500">{k}</span>
    <span className="font-medium text-slate-800 text-right">{v}</span>
  </div>
));

const fileToB64 = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
});

function OperationCard({ wid, op, onChanged }) {
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);

  const act = async (verb, fn) => {
    setBusy(verb);
    try { await fn(); await onChanged(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
    setBusy("");
  };
  const start    = () => act("start",    () => api.post(`/work-orders/${wid}/operations/${op.id}/start`));
  const complete = () => act("complete", () => api.post(`/work-orders/${wid}/operations/${op.id}/complete`));
  const hold     = () => act("hold",     () => api.post(`/work-orders/${wid}/operations/${op.id}/hold`));

  const onPhoto = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy("photo");
    try {
      const b64 = await fileToB64(f);
      await api.post(`/work-orders/${wid}/operations/${op.id}/photo`, { photo: b64 });
      toast.success("Photo uploaded"); await onChanged();
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    setBusy(""); if (e.target) e.target.value = "";
  };

  const done = op.status === "done";
  const running = op.status === "running";

  return (
    <div className="border border-slate-200 rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-800 truncate">{op.seq}. {op.operation}</div>
          <div className="text-xs text-slate-400 truncate">
            {[op.machine, op.operator].filter(Boolean).join(" · ") || "—"}
            {op.actual_minutes ? ` · ${op.actual_minutes}m` : op.planned_minutes ? ` · ~${op.planned_minutes}m` : ""}
          </div>
        </div>
        <StatusBadge status={op.status} />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {!done && !running && (
          <Button size="sm" className="h-9 flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={!!busy} onClick={start}>
            {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-4 w-4 mr-1" /> Start</>}
          </Button>
        )}
        {running && (
          <Button size="sm" className="h-9 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!!busy} onClick={complete}>
            {busy === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Done</>}
          </Button>
        )}
        {running && (
          <Button size="sm" variant="outline" className="h-9" disabled={!!busy} onClick={hold} title="Hold">
            <Pause className="h-4 w-4" />
          </Button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        <Button size="sm" variant="outline" className="h-9" disabled={!!busy} onClick={() => fileRef.current?.click()} title="Add inspection photo">
          {busy === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {op.photo_count > 0 && <span className="ml-1 text-xs">{op.photo_count}</span>}
        </Button>
      </div>
    </div>
  );
}

export default function Scan() {
  const { entity, id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const meta = ENTITY_META[entity] || { label: entity, icon: QrCode, to: "/app" };
  const Icon = meta.icon;

  const load = useCallback(async () => {
    try { const r = await api.get(`/scan/${entity}/${id}`, { silent: true }); setData(r.data); setErr(""); }
    catch (e) { setErr(e?.response?.data?.detail || "Record not found"); }
  }, [entity, id]);

  useEffect(() => { setData(null); setErr(""); load(); }, [load]);

  const r = data?.record || {};

  return (
    <div className="max-w-md mx-auto p-1 md:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-red-600" />
        <div className="text-xs uppercase tracking-wider text-red-600 font-semibold">{meta.label}</div>
      </div>

      {err && <Card className="p-6 text-center text-sm text-slate-500">{err}</Card>}
      {!data && !err && <Card className="p-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></Card>}

      {data && (
        <>
          <Card className="p-4 mb-3">
            <div className="text-xl font-bold break-words">{data.code}</div>
            {data.title && <div className="text-sm text-slate-500">{data.title}</div>}
            <div className="mt-3">
              {entity === "work-order" && (<>
                <Row k="Customer" v={r.customer_name || r.customer} />
                <Row k="Qty" v={r.qty} />
                <Row k="Status" v={<StatusBadge status={r.status} />} />
                <Row k="Priority" v={r.priority} />
                <Row k="Due date" v={r.due_date} />
                <Row k="Part No." v={r.part_number} />
              </>)}
              {entity === "part" && (<>
                <Row k="Customer" v={r.customer_name} />
                <Row k="Material" v={r.material} />
                <Row k="Process" v={Array.isArray(r.process) ? r.process.join(", ") : r.process} />
                <Row k="Revision" v={r.current_revision} />
                <Row k="Cycle time" v={r.cycle_time_minutes ? `${r.cycle_time_minutes} min` : ""} />
                <Row k="Raw material" v={r.raw_material_size} />
              </>)}
              {entity === "inventory" && (<>
                <Row k="On hand" v={r.qty_on_hand} />
                <Row k="UoM" v={r.uom} />
                <Row k="Reorder level" v={r.reorder_level} />
                <Row k="Category" v={r.category} />
                <Row k="Location" v={r.location} />
              </>)}
            </div>
          </Card>

          {entity === "work-order" && Array.isArray(data.operations) && (
            <Card className="p-4 mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Operations — tap to update from the shop floor
              </div>
              {data.operations.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-4">No operations on this work order yet.</div>
              ) : (
                <div className="space-y-2">
                  {data.operations.map((op) => (
                    <OperationCard key={op.id} wid={id} op={op} onChanged={load} />
                  ))}
                </div>
              )}
            </Card>
          )}

          <Link to={meta.to} className="flex items-center justify-center gap-1 text-sm text-red-600 hover:underline py-2">
            Open in {meta.label} list <ArrowRight className="w-4 h-4" />
          </Link>
        </>
      )}
    </div>
  );
}
