import { CrudPage, StatusBadge } from "@/components/erp/CrudPage";
import { fmtDate } from "@/components/erp/Primitives";

const fields = [
  { name: "title", label: "Title", required: true },
  { name: "channel", label: "Channel", type: "select", options: [
      {value:"whatsapp",label:"WhatsApp"},{value:"instagram",label:"Instagram"},{value:"linkedin",label:"LinkedIn"},
      {value:"facebook",label:"Facebook"},{value:"email",label:"Email"},{value:"other",label:"Other"}] },
  { name: "scheduled_for", label: "Scheduled For", type: "date" },
  { name: "status", label: "Status", type: "select", options: [
      {value:"draft",label:"Draft"},{value:"scheduled",label:"Scheduled"},{value:"published",label:"Published"}] },
  { name: "content", label: "Content", type: "textarea", full: true },
  { name: "metrics", label: "Metrics / Notes", type: "textarea", full: true },
];

const cols = [
  { key: "title", label: "Title" },
  { key: "channel", label: "Channel", render: (r) => <span className="uppercase text-xs font-semibold text-slate-600">{r.channel}</span> },
  { key: "scheduled_for", label: "Scheduled", render: (r) => fmtDate(r.scheduled_for) },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status === "published" ? "done" : r.status === "scheduled" ? "in_progress" : "draft"} /> },
  { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
];

export default function Marketing() {
  return (
    <CrudPage
      testid="marketing-page"
      overline="Growth"
      title="Marketing & Social"
      subtitle="Plan, draft and track posts across WhatsApp, Instagram, LinkedIn and more. Hook to APIs later."
      endpoint="/campaigns"
      fields={fields}
      columns={cols}
      defaults={{ status: "draft", channel: "whatsapp" }}
    />
  );
}
