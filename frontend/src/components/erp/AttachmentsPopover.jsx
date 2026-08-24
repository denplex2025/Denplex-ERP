import { useState } from "react";
import api from "@/lib/api";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Paperclip, Download, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

/** Attach/view files (payment receipts, cheque scans, UPI screenshots, bank slips, etc.) linked to
 * any ERP record. Reuses the existing generic Documents module (POST/GET/DELETE /documents with
 * linked_to + linked_type) that Documents.jsx and QC photos already rely on — base64-in-JSON
 * storage with transparent Google Drive offload when configured — so no new backend endpoint is
 * needed here. Attachment list is lazy-loaded on first open, not on table mount, to avoid an N+1
 * request per row in a long list. */
export default function AttachmentsPopover({ linkedTo, linkedType, category = "general", label = "Attachments" }) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState(null); // null = not loaded yet
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/documents", { params: { linked_to: linkedTo, linked_type: linkedType } });
      setDocs(r.data || []);
    } catch { setDocs([]); }
  };

  const onOpenChange = (v) => { setOpen(v); if (v && docs === null) load(); };

  const upload = (file) => {
    if (!file || !linkedTo) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.post("/documents", {
          name: file.name, category, linked_to: linkedTo, linked_type: linkedType,
          file_base64: reader.result, mime: file.type, size: file.size,
        });
        toast.success("Attached"); load();
      } catch (e) { toast.error(e?.response?.data?.detail || "Attach failed"); }
      finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const dl = async (d) => {
    try {
      const r = await api.get(`/documents/${d.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = d.name || "attachment"; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Download failed"); }
  };

  const del = async (d) => {
    if (!window.confirm(`Remove "${d.name}"?`)) return;
    try { await api.delete(`/documents/${d.id}`); toast.success("Removed"); load(); }
    catch { toast.error("Failed to remove"); }
  };

  const count = docs?.length ?? 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={!linkedTo}
          className={`inline-flex items-center justify-center h-8 w-8 rounded-sm hover:bg-slate-100 disabled:opacity-30 ${docs && count > 0 ? "text-red-600" : "text-slate-400"}`}
          title={linkedTo ? "Attachments (receipt, cheque/UPI proof, etc.)" : "Save first to attach files"}
        >
          <Paperclip className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 rounded-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">{label}</div>
        {docs === null ? (
          <div className="text-xs text-slate-400 py-2">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="text-xs text-slate-400 py-1 mb-2">No files attached yet.</div>
        ) : (
          <div className="space-y-1.5 mb-2 max-h-48 overflow-y-auto">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span className="truncate flex-1" title={d.name}>{d.name}</span>
                <button onClick={() => dl(d)} title="Download" className="text-slate-500 hover:text-red-600 shrink-0"><Download className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(d)} title="Remove" className="text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <label className={`flex items-center justify-center gap-1.5 text-xs border border-dashed border-slate-300 rounded-sm py-2 text-slate-500 ${uploading ? "opacity-60" : "cursor-pointer hover:border-red-400 hover:text-red-600"}`}>
          <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Attach file"}
          <input type="file" className="hidden" disabled={uploading} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </PopoverContent>
    </Popover>
  );
}
