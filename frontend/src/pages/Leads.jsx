import { CrudPage, StatusBadge } from "@/components/erp/CrudPage";
import { fmtDate } from "@/components/erp/Primitives";

const fields = [
  { name: "name", label: "Name", required: true },
  { name: "company", label: "Company" },
  { name: "phone", label: "Phone (with country code)" },
  { name: "email", label: "Email" },
  { name: "source", label: "Source", type: "select", options: [
      {value:"manual",label:"Manual"},{value:"b2b",label:"B2B Site"},{value:"website",label:"Website"},{value:"referral",label:"Referral"}] },
  { name: "status", label: "Status", type: "select", options: [
      {value:"new",label:"New"},{value:"contacted",label:"Contacted"},{value:"qualified",label:"Qualified"},
      {value:"converted",label:"Converted"},{value:"lost",label:"Lost"}] },
  { name: "requirement", label: "Requirement", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

const cols = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
];

export default function Leads() {
  return (
    <CrudPage
      testid="leads-page"
      overline="Sales"
      title="Leads"
      subtitle="Capture inquiries from B2B sites, website forms, referrals. Click the WhatsApp icon to contact instantly."
      endpoint="/leads"
      fields={fields}
      columns={cols}
      defaults={{ status: "new", source: "manual" }}
      whatsappField="phone"
      emptyLabel="No leads yet. Click 'New' to add your first."
    />
  );
}
