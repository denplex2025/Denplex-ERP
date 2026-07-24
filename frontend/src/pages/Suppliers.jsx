import { Link } from "react-router-dom";
import { PartyDualPane } from "@/components/erp/PartyDualPane";
import { ClipboardCheck } from "lucide-react";

const fields = [
  { name: "name", label: "Supplier Name", required: true },
  { name: "contact_person", label: "Contact Person" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "gstin", label: "GSTIN" },
  { name: "contract_expiry", label: "Contract Expiry", type: "date" },
  { name: "address", label: "Address", type: "textarea", full: true },
];

export default function Suppliers() {
  return (
    <PartyDualPane
      testid="suppliers-page"
      overline="Procurement"
      title="Vendor & Supplier Management"
      subtitle="Click a supplier to view their full ledger — filter by type, status, date, total, or balance."
      endpoint="/suppliers"
      kind="supplier"
      fields={fields}
      headerExtra={
        <Link
          to="/app/iso"
          className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:underline font-semibold"
          data-testid="supplier-performance-link"
        >
          <ClipboardCheck className="h-3.5 w-3.5" /> Supplier performance evaluations (ISO F/PUR/03-04) →
        </Link>
      }
    />
  );
}
