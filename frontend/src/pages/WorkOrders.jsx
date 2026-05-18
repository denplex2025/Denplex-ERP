import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CrudPage, StatusBadge } from "@/components/erp/CrudPage";
import { fmtDate } from "@/components/erp/Primitives";

export default function WorkOrders() {
  const [customers, setCustomers] = useState([]);
  const [boms, setBoms] = useState([]);
  useEffect(() => {
    api.get("/customers").then(r=>setCustomers(r.data));
    api.get("/bom").then(r=>setBoms(r.data));
  }, []);

  const fields = [
    { name: "product", label: "Product", required: true },
    { name: "qty", label: "Quantity", type: "number", required: true },
    { name: "customer_id", label: "Customer", type: "select", options: [{value:"",label:"— none —"}, ...customers.map(c=>({value:c.id,label:c.name}))] },
    { name: "bom_id", label: "Link BOM", type: "select", options: [{value:"",label:"— none —"}, ...boms.map(b=>({value:b.id,label:`${b.product_name} (${b.code})`}))] },
    { name: "po_ref", label: "Customer PO Ref" },
    { name: "priority", label: "Priority", type: "select", options: [{value:"low",label:"Low"},{value:"medium",label:"Medium"},{value:"high",label:"High"}] },
    { name: "status", label: "Status", type: "select", options: ["planned","in_progress","qc","completed","on_hold","cancelled"].map(v=>({value:v,label:v})) },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "due_date", label: "Due Date", type: "date" },
    { name: "progress", label: "Progress %", type: "number" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ];

  const cols = [
    { key: "code", label: "Code", render: (r) => <span className="font-mono-tech text-xs">{r.code}</span> },
    { key: "product", label: "Product" },
    { key: "qty", label: "Qty" },
    { key: "customer_name", label: "Customer", render:(r) => customers.find(c=>c.id===r.customer_id)?.name || "—" },
    { key: "po_ref", label: "PO Ref" },
    { key: "priority", label: "Priority" },
    { key: "progress", label: "Progress", render: (r) => `${r.progress || 0}%` },
    { key: "due_date", label: "Due", render: (r) => fmtDate(r.due_date) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const transform = (form) => {
    const c = customers.find(x=>x.id===form.customer_id);
    return { ...form, customer_name: c?.name || "" };
  };

  return (
    <CrudPage
      testid="work-orders-page"
      overline="Production"
      title="Work Orders"
      subtitle="Plan and track production runs. Each WO can have multiple job cards & QC reports."
      endpoint="/work-orders"
      fields={fields}
      columns={cols}
      defaults={{ status: "planned", priority: "medium", progress: 0 }}
    />
  );
}
