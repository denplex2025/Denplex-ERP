import { PartyDualPane } from "@/components/erp/PartyDualPane";

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

export default function Customers() {
  return (
    <PartyDualPane
      testid="customers-page"
      overline="CRM"
      title="Customers"
      subtitle="Click a customer to view their full ledger — filter by type, status, date, total, or balance."
      endpoint="/customers"
      kind="customer"
      fields={fields}
      defaults={{ customer_type: "one_time" }}
    />
  );
}
