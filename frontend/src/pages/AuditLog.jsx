import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/audit-logs").then(r => setRows(r.data)).catch(()=>{}); }, []);
  return (
    <div data-testid="audit-page">
      <PageHeader overline="Compliance" title="Audit Log" subtitle="Sensitive actions (sends, 2FA changes, integration imports) are recorded here." />
      <Card>
        {rows.length === 0 ? <Empty label="No audit events." /> : (
          <table className="w-full">
            <thead><tr><Th>Time</Th><Th>User</Th><Th>IP</Th><Th>Action</Th><Th>Entity</Th><Th>ID</Th><Th>Details</Th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>{fmtDate(r.created_at)}</Td>
                  <Td>{r.user}</Td>
                  <Td className="font-mono-tech text-xs text-slate-500">{r.ip || "—"}</Td>
                  <Td className="uppercase text-xs font-semibold">{r.action}</Td>
                  <Td>{r.entity}</Td>
                  <Td className="font-mono-tech text-xs">{r.entity_id}</Td>
                  <Td className="text-xs text-slate-600">{JSON.stringify(r.details).slice(0,80)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
