import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { PageHeader, Card } from "@/components/erp/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, FileDown, Search, Tag } from "lucide-react";
import { toast } from "sonner";

const TYPE_CFG = {
  "vendor-bills":      { title: "Purchase Bills",     overline: "Purchases",     endpoint: "/vendor-bills",       party: "supplier_name", icon: "Purchase Bill" },
  "sale-orders":       { title: "Sale Orders",        overline: "Sales",         endpoint: "/sale-orders",        party: "customer_name", icon: "Sale Order" },
  "delivery-challans": { title: "Delivery Challans",  overline: "Logistics",     endpoint: "/delivery-challans",  party: "customer_name", icon: "Delivery Challan" },
  "job-work-out":      { title: "Job Work Out",       overline: "Operations",    endpoint: "/job-work-out",       party: "customer_name", icon: "Job Work" },
  "credit-notes":      { title: "Credit Notes",       overline: "Returns",       endpoint: "/credit-notes",       party: "customer_name", icon: "Credit Note" },
};

export default function DocList() {
  const { kind } = useParams();
  const cfg = TYPE_CFG[kind];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!cfg) return;
    setLoading(true);
    api.get(cfg.endpoint)
       .then(r => setRows(r.data || []))
       .catch(e => toast.error(e?.response?.data?.detail || "Failed to load"))
       .finally(()=> setLoading(false));
  }, [cfg]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter(r =>
      String(r.code || "").toLowerCase().includes(s) ||
      String(r[cfg.party] || "").toLowerCase().includes(s)
    );
  }, [rows, q, cfg]);

  const preview_pdf = async (r) => {
    try {
      const resp = await api.get(`${cfg.endpoint}/${r.id}/pdf`, { responseType: "blob" });
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(resp.data));
    } catch (e) { toast.error("PDF failed"); }
  };
  const download_pdf = async (r) => {
    try {
      const resp = await api.get(`${cfg.endpoint}/${r.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a"); a.href = url; a.download = `${r.code || cfg.icon}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("PDF failed"); }
  };

  if (!cfg) return <div className="p-6 text-slate-500">Unknown document type: {kind}</div>;

  return (
    <div data-testid={`doclist-${kind}`}>
      <PageHeader overline={cfg.overline} title={cfg.title} subtitle={`${rows.length} record${rows.length === 1 ? "" : "s"}`} />
      <Card className="p-4 mb-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search by code or party…" className="rounded-sm max-w-sm" data-testid={`search-${kind}`} />
          <span className="text-xs text-slate-500 ml-2">Showing {filtered.length}</span>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="p-0 lg:col-span-3 overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 text-center">No records.</div>
          ) : (
            <div className="max-h-[75vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-600">
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Party</th>
                    <th className="px-3 py-2 text-right">Total (₹)</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map(r => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono-tech text-xs">{r.code}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{(r.date || "").slice(0, 10)}</td>
                      <td className="px-3 py-2 truncate max-w-[260px]">{r[cfg.party] || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono-tech">{Number(r.total || 0).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>preview_pdf(r)} title="Preview"><Eye className="h-4 w-4 text-slate-700" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>download_pdf(r)} title="Download"><FileDown className="h-4 w-4 text-slate-700" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 200 && (
                <div className="p-3 text-xs text-slate-500 text-center border-t border-slate-100">Showing first 200 of {filtered.length} — refine search to see specific records.</div>
              )}
            </div>
          )}
        </Card>
        <Card className="p-2 lg:col-span-2 bg-slate-50">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs uppercase tracking-wider text-slate-600">Preview</span>
            {preview && <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-red-600 underline">Open</a>}
          </div>
          {preview ? (
            <iframe title="doc-preview" src={preview} className="w-full h-[72vh] bg-white border border-slate-200" data-testid={`preview-iframe-${kind}`} />
          ) : (
            <div className="h-[72vh] grid place-items-center text-xs text-slate-500 border border-dashed border-slate-300 m-1">
              <div className="text-center"><Tag className="h-6 w-6 text-slate-400 mx-auto mb-2" />Click the eye icon on any row to preview.</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
