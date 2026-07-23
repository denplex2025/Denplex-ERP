import { PartyDualPane } from "@/components/erp/PartyDualPane";

const fields = [
  { name: "name", label: "Supplier Name", required: true },
  { name: "contact_person", label: "Contact Person" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "gstin", label: "GSTIN" },
  { name: "address", label: "Address", type: "textarea", full: true },
];

export default function Suppliers() {
  return (
    <PartyDualPane
      testid="suppliers-page"
      overline="Procurement"
      title="Suppliers"
      subtitle="Click a supplier to view their full ledger — filter by type, status, date, total, or balance."
      endpoint="/suppliers"
      kind="supplier"
      fields={fields}
    />
  );
}
