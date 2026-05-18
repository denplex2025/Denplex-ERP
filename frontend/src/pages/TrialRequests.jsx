import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import { Copy, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function TrialRequests() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [approveOpen, setApproveOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState(null);

  const load = async () => {
    try { const r = await api.get("/trial/requests", { params: { status: tab } }); setRows(r.data); }
    catch (e) { toast.error("Admin only"); }
  };
  useEffect(() => { load(); }, [tab]);

  const openApprove = (row) => { setTarget(row); setNote(""); setResult(null); setApproveOpen(true); };
  const approve = async () => {
    try {
      const r = await api.post(`/trial/requests/${target.id}/approve`, { note });
      setResult(r.data);
      toast.success("Approved — share credentials with the user");
      // refresh on close
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const reject = async (row) => {
    const reason = window.prompt("Reason for rejection (optional)") ?? "";
    try { await api.post(`/trial/requests/${row.id}/reject`, { note: reason }); toast.success("Rejected"); load(); }
    catch (e) { toast.error("Failed"); }
  };
  const del = async (row) => {
    if (!window.confirm("Delete this request?")) return;
    try { await api.delete(`/trial/requests/${row.id}`); load(); } catch (e) { toast.error("Failed"); }
  };
  const copy = (text) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  return (
    <div data-testid="trial-requests-page">
      <PageHeader overline="Customer Onboarding" title="Trial Requests" subtitle="Verify each request, approve to auto-create a 1-month trial account with view + create access only." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-slate-100 mb-4">
          <TabsTrigger value="pending" className="rounded-sm" data-testid="tab-pending">Pending</TabsTrigger>
          <TabsTrigger value="approved" className="rounded-sm" data-testid="tab-approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected" className="rounded-sm" data-testid="tab-rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            {rows.length === 0 ? <Empty label={`No ${tab} requests.`} /> : (
              <table className="w-full">
                <thead>
                  <tr><Th>Requested</Th><Th>Name</Th><Th>Company</Th><Th>Contact</Th><Th>GSTIN</Th><Th>Purpose</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 align-top">
                      <Td>{fmtDate(r.created_at)}</Td>
                      <Td className="font-medium">{r.name}</Td>
                      <Td>{r.company}</Td>
                      <Td className="text-xs">
                        <div>{r.email}</div>
                        <div className="text-slate-500 font-mono-tech">{r.phone}</div>
                      </Td>
                      <Td className="font-mono-tech text-xs">{r.gstin || "—"}</Td>
                      <Td className="text-xs text-slate-600 max-w-xs">{r.purpose || r.business_type}</Td>
                      <Td><StatusBadge status={r.status === "approved" ? "done" : r.status === "rejected" ? "cancelled" : "draft"} /></Td>
                      <Td className="text-right whitespace-nowrap">
                        {r.status === "pending" && (
                          <>
                            <Button size="sm" className="rounded-sm bg-emerald-600 hover:bg-emerald-700 h-8" onClick={()=>openApprove(r)} data-testid={`approve-${r.id}`}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 ml-1" onClick={()=>reject(r)} title="Reject" data-testid={`reject-${r.id}`}><XCircle className="h-4 w-4 text-red-600" /></Button>
                          </>
                        )}
                        {r.status === "approved" && r.temp_password && (
                          <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={()=>copy(`Email: ${r.email}\nPassword: ${r.temp_password}\nExpires: ${r.trial_expires_at}`)}>
                            <Copy className="h-4 w-4 mr-1" /> Copy creds
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>del(r)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={approveOpen} onOpenChange={(v)=>{ if (!v) { setApproveOpen(false); if (result) load(); }}}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display">Approve trial — {target?.company}</DialogTitle></DialogHeader>
          {!result ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Confirm you've verified <strong>{target?.email}</strong> ({target?.phone}). The system will create a trial account valid for 30 days.</p>
              <div>
                <Label className="text-xs uppercase">Verification note (optional)</Label>
                <Textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} className="rounded-sm mt-1.5" placeholder="e.g. Verified GSTIN via official portal, called to confirm intent." />
              </div>
            </div>
          ) : (
            <div className="space-y-3 fade-up">
              <p className="text-sm text-emerald-700 font-medium">Trial account created. Share these credentials with the user.</p>
              <div className="border border-slate-200 p-3 bg-slate-50 text-sm">
                <div><span className="text-xs uppercase text-slate-500">Email</span><div className="font-mono-tech">{result.email}</div></div>
                <div className="mt-2"><span className="text-xs uppercase text-slate-500">Temporary password</span><div className="font-mono-tech text-red-700">{result.temp_password}</div></div>
                <div className="mt-2"><span className="text-xs uppercase text-slate-500">Trial expires</span><div className="font-mono-tech">{fmtDate(result.trial_expires_at)}</div></div>
              </div>
              <Button onClick={()=>{ navigator.clipboard.writeText(`Denplex ERP trial:\nLogin: ${window.location.origin}/login\nEmail: ${result.email}\nPassword: ${result.temp_password}\nExpires: ${result.trial_expires_at}`); toast.success("Copied"); }} variant="outline" className="rounded-sm w-full">
                <Copy className="h-4 w-4 mr-2" /> Copy full message
              </Button>
            </div>
          )}
          <DialogFooter>
            {!result && (
              <>
                <Button variant="outline" className="rounded-sm" onClick={()=>setApproveOpen(false)}>Cancel</Button>
                <Button onClick={approve} className="rounded-sm bg-emerald-600 hover:bg-emerald-700" data-testid="confirm-approve">Approve & create account</Button>
              </>
            )}
            {result && <Button onClick={()=>{setApproveOpen(false); load();}} className="rounded-sm bg-red-600 hover:bg-red-700">Done</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
