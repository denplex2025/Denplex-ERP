import { CrudPage, StatusBadge } from "@/components/erp/CrudPage";
import { fmtDate } from "@/components/erp/Primitives";

const fields = [
  { name: "name", label: "Customer Name", required: true },
  { name: "contact_person", label: "Contact Person" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "gstin", label: "GSTIN" },
  { name: "customer_type", label: "Type", type: "select", options: [
      {value:"one_time", label:"One-time"},{value:"repeat", label:"Repeat"}] },
  { name: "address", label: "Address", type: "textarea", full: true },
];

const cols = [
  { key: "code", label: "Code", render: (r) => <span className="font-mono-tech text-xs">{r.code}</span> },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "gstin", label: "GSTIN" },
  { key: "customer_type", label: "Type", render: (r) => <StatusBadge status={r.customer_type} /> },
  { key: "orders_count", label: "Orders" },
  { key: "created_at", label: "Since", render: (r) => fmtDate(r.created_at) },
];

export default function Customers() {
  return (
    <CrudPage
      testid="customers-page"
      overline="CRM"
      title="Customers"
      subtitle="One-time vs repeat customers — auto segregated after multiple work orders."
      endpoint="/customers"
      fields={fields}
      columns={cols}
      defaults={{ customer_type: "one_time" }}
      whatsappField="phone"
    />
  );
}
