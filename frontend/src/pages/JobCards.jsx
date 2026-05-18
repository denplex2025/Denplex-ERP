import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CrudPage, StatusBadge } from "@/components/erp/CrudPage";

export default function JobCards() {
  const [wos, setWos] = useState([]);
  useEffect(() => { api.get("/work-orders").then(r => setWos(r.data)); }, []);

  const fields = [
    { name: "work_order_id", label: "Work Order", required: true, type: "select", options: wos.map(w=>({value:w.id,label:`${w.code} · ${w.product}`})) },
    { name: "operation", label: "Operation (e.g. Milling, Turning)", required: true },
    { name: "machine", label: "Machine" },
    { name: "operator", label: "Operator" },
    { name: "qty_planned", label: "Qty Planned", type: "number" },
    { name: "qty_done", label: "Qty Done", type: "number" },
    { name: "status", label: "Status", type: "select", options: ["pending","in_progress","done"].map(v=>({value:v,label:v})) },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ];

  const cols = [
    { key: "code", label: "Code", render: (r) => <span className="font-mono-tech text-xs">{r.code}</span> },
    { key: "work_order_code", label: "WO" },
    { key: "operation", label: "Operation" },
    { key: "machine", label: "Machine" },
    { key: "operator", label: "Operator" },
    { key: "progress", label: "Progress", render: (r) => `${r.qty_done || 0} / ${r.qty_planned || 0}` },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <CrudPage
      testid="job-cards-page"
      overline="Production"
      title="Job Cards"
      subtitle="Operation-level tracking on the shop floor."
      endpoint="/job-cards"
      fields={fields}
      columns={cols}
      defaults={{ status: "pending" }}
    />
  );
}
