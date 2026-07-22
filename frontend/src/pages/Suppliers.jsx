import { CrudPage } from "@/components/erp/CrudPage";
import { fmtDate } from "@/components/erp/Primitives";
import { ViewLedgerButton } from "@/components/erp/PartyLedgerSheet";

const fields = [
  { name: "name", label: "Supplier Name", required: true },
  { name: "contact_person", label: "Contact Person" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "gstin", label: "GSTIN" },
  { name: "address", label: "Address", type: "textarea", full: true },
];

const cols = [
  { key: "name", label: "Name" },
  { key: "contact_person", label: "Contact" },
  { key: "phone", label: "Phone" },
  { key: "gstin", label: "GSTIN" },
  { key: "created_at", label: "Since", render: (r) => fmtDate(r.created_at) },
];

export default function Suppliers() {
  return (
    <CrudPage
      testid="suppliers-page"
      overline="Procurement"
      title="Suppliers"
      subtitle="Manage vendors. Use WhatsApp to send purchase orders directly."
      endpoint="/suppliers"
      fields={fields}
      columns={cols}
      whatsappField="phone"
      rowActions={(row) => <ViewLedgerButton row={row} />}
    />
  );
}
