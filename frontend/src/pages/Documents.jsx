import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { Upload, Trash2, Download, History, GitBranch } from "lucide-react";
import { toast } from "sonner";

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("general");
  const [file, setFile] = useState(null);
  const [revOpen, setRevOpen] = useState(false);
  const [revDoc, setRevDoc] = useState(null);
  const [revFile, setRevFile] = useState(null);
  const [revNotes, setRevNotes] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);

  const load = async () => { const r = await api.get("/documents"); setDocs(r.data); };
  useEffect(() => { load(); }, []);

  const upload = async () => {
    if (!file) { toast.error("Choose a file"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.post("/documents", {
          name: name || file.name,
          category,
          file_base64: reader.result,
          mime: file.type,
          size: file.size,
        });
        toast.success("Uploaded"); setName(""); setFile(null); load();
      } catch (e) { toast.error("Failed"); }
    };
    reader.readAsDataURL(file);
  };
  const del = async (d) => { if (!window.confirm("Delete?")) return; await api.delete(`/documents/${d.id}`); load(); };

  const openRev = (d) => { setRevDoc(d); setRevFile(null); setRevNotes(""); setRevOpen(true); };
  const saveRev = async () => {
    if (!revFile) { toast.error("Choose a file"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.post(`/documents/${revDoc.id}/revisions`, { file_base64: reader.result, notes: revNotes });
        toast.success("New revision saved"); setRevOpen(false); load();
      } catch (e) { toast.error("Failed"); }
    };
    reader.readAsDataURL(revFile);
  };

  const openHistory = async (d) => {
    try {
      const r = await api.get(`/documents/${d.id}/revisions`);
      setHistory(r.data.revisions || []);
      setHistoryOpen(true);
    } catch (e) { toast.error("Failed"); }
  };

  return (
    <div data-testid="documents-page">
      <PageHeader overline="Knowledge" title="Documents" subtitle="ISO 9001 QMS docs, drawings, packaging photos, QC attachments — with revision tracking." />
      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label className="text-xs uppercase">Name</Label><Input value={name} onChange={e=>setName(e.target.value)} className="rounded-sm mt-1.5" data-testid="doc-name" /></div>
          <div><Label className="text-xs uppercase">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-sm mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="iso">ISO 9001 QMS</SelectItem>
                <SelectItem value="drawing">Drawing</SelectItem>
                <SelectItem value="qc">QC</SelectItem>
                <SelectItem value="packaging">Packaging</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs uppercase">File</Label>
            <input type="file" onChange={e=>setFile(e.target.files?.[0])} className="block mt-2 text-sm" data-testid="doc-file" />
          </div>
          <div className="flex items-end"><Button onClick={upload} className="rounded-sm bg-red-600 hover:bg-red-700 w-full" data-testid="doc-upload"><Upload className="h-4 w-4 mr-1" /> Upload</Button></div>
        </div>
      </Card>

      <Card>
        {docs.length === 0 ? <Empty label="No documents uploaded." /> : (
          <table className="w-full">
            <thead><tr><Th>Name</Th><Th>Category</Th><Th>Rev</Th><Th>Size</Th><Th>By</Th><Th>Date</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <Td>{d.name}</Td>
                  <Td className="uppercase text-xs">{d.category}</Td>
                  <Td className="font-mono-tech text-xs">Rev {d.current_revision ?? 0}</Td>
                  <Td>{(d.size/1024).toFixed(1)} KB</Td>
                  <Td>{d.uploaded_by}</Td>
                  <Td>{fmtDate(d.created_at)}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>openRev(d)} title="Add revision" data-testid={`doc-revise-${d.id}`}><GitBranch className="h-4 w-4 text-red-600" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>openHistory(d)} title="Revision history"><History className="h-4 w-4" /></Button>
                    <a href={d.file_base64} download={d.name}><Button size="icon" variant="ghost" className="h-8 w-8"><Download className="h-4 w-4" /></Button></a>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>del(d)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={revOpen} onOpenChange={setRevOpen}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display">Upload new revision</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">{revDoc?.name}</p>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase">File</Label>
              <input type="file" onChange={e=>setRevFile(e.target.files?.[0])} className="block mt-2 text-sm" data-testid="rev-file" /></div>
            <div><Label className="text-xs uppercase">Revision notes</Label>
              <Input value={revNotes} onChange={e=>setRevNotes(e.target.value)} className="rounded-sm mt-1.5" placeholder="e.g. Updated clause 7.5.3" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setRevOpen(false)}>Cancel</Button>
            <Button onClick={saveRev} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-revision">Save revision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="rounded-sm max-w-2xl">
          <DialogHeader><DialogTitle className="font-display">Revision history</DialogTitle></DialogHeader>
          {history.length === 0 ? <Empty label="No revisions yet." /> : (
            <table className="w-full">
              <thead><tr><Th>Rev</Th><Th>By</Th><Th>Date</Th><Th>Notes</Th><Th></Th></tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.rev_no} className="hover:bg-slate-50">
                    <Td className="font-mono-tech">Rev {h.rev_no}</Td>
                    <Td>{h.by}</Td>
                    <Td>{fmtDate(h.created_at)}</Td>
                    <Td className="text-slate-600">{h.notes}</Td>
                    <Td><a href={h.file_base64} download={`rev-${h.rev_no}`}><Button size="sm" variant="outline" className="rounded-sm h-7">Download</Button></a></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
