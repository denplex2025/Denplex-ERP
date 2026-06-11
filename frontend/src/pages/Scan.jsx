import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/erp/Primitives";
import StatusBadge from "@/components/erp/StatusBadge";
import { QrCode, ArrowRight, Loader2, Factory, Cog, Boxes } from "lucide-react";

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

export default function Scan() {
  const { entity, id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const meta = ENTITY_META[entity] || { label: entity, icon: QrCode, to: "/app" };
  const Icon = meta.icon;

  useEffect(() => {
    setData(null); setErr("");
    api.get(`/scan/${entity}/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || "Record not found"));
  }, [entity, id]);

  const r = data?.record || {};

  return (
    <div className="max-w-md mx-auto p-3 md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-red-600" />
        <div className="text-xs uppercase tracking-wider text-red-600 font-semibold">{meta.label}</div>
      </div>

      {err && <Card className="p-6 text-center text-sm text-slate-500">{err}</Card>}

      {!data && !err && (
        <Card className="p-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></Card>
      )}

      {data && (
        <>
          <Card className="p-4 mb-3">
            <div className="text-xl font-bold">{data.code}</div>
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

          {entity === "work-order" && Array.isArray(data.operations) && data.operations.length > 0 && (
            <Card className="p-4 mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Operations</div>
              <div className="space-y-1.5">
                {data.operations.map((op) => (
                  <div key={op.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-1.5">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 truncate">{op.seq}. {op.operation}</div>
                      <div className="text-xs text-slate-400 truncate">{[op.machine, op.operator].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <StatusBadge status={op.status} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Link to={meta.to} className="flex items-center justify-center gap-1 text-sm text-red-600 hover:underline">
            Open in {meta.label} list <ArrowRight className="w-4 h-4" />
          </Link>
        </>
      )}
    </div>
  );
}
