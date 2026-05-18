import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export default function BOMPage() {
  const [items, setItems] = useState([]);
  const [invItems, setInvItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ lines: [] });

  const load = async () => {
    const [a, b] = await Promise.all([api.get("/bom"), api.get("/inventory/items")]);
    setItems(a.data); setInvItems(b.data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ product_name: "", lines: [{ item_id: "", item_name: "", qty: 1, uom: "pcs" }] }); setOpen(true); };
  const openEdit = (r) => { setEditing(r); setForm({ ...r, lines: r.lines || [] }); setOpen(true); };
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setLine = (i, k, v) => setForm(p => { const ls=[...p.lines]; ls[i]={...ls[i],[k]:v}; return {...p, lines:ls};});
  const setLineItem = (i, id) => {
    const it = invItems.find(x=>x.id===id);
    setForm(p => { const ls=[...p.lines]; ls[i] = { ...ls[i], item_id: id, item_name: it?.name||"", uom: it?.uom||"pcs" }; return {...p, lines: ls}; });
  };

  const save = async () => {
    try {
      if (editing) await api.put(`/bom/${editing.id}`, form);
      else await api.post("/bom", form);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error("Failed"); }
  };
  const del = async (r) => { if (!window.confirm("Delete?")) return; await api.delete(`/bom/${r.id}`); load(); };

  return (
    <div data-testid="bom-page">
      <PageHeader
        overline="Engineering" title="Bill of Materials"
        subtitle="Recipe per product. Auto-generates a Design Code linked to your SolidWorks files."
        actions={<Button onClick={openNew} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="new-bom"><Plus className="h-4 w-4 mr-1" /> New BOM</Button>}
      />
      <Card>
        {items.length === 0 ? <Empty label="No BOMs yet." /> : (
          <table className="w-full">
            <thead><tr><Th>Code</Th><Th>Product</Th><Th>Design Code</Th><Th>Lines</Th><Th>Created</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {items.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="font-mono-tech text-xs">{r.code}</Td>
                  <Td>{r.product_name}</Td>
                  <Td className="font-mono-tech text-xs">{r.design_code}</Td>
                  <Td>{r.lines?.length || 0}</Td>
                  <Td>{fmtDate(r.created_at)}</Td>
                  <Td className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(r)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-3xl">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Edit" : "New"} BOM</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Product Name *"><Input value={form.product_name || ""} onChange={e=>setF("product_name", e.target.value)} data-testid="bom-product-name" /></Field>
            <Field label="Design Code (optional)"><Input value={form.design_code || ""} onChange={e=>setF("design_code", e.target.value)} placeholder="Auto if empty" /></Field>
            <div className="col-span-2"><Field label="SolidWorks file URL / path"><Input value={form.solidworks_url || ""} onChange={e=>setF("solidworks_url", e.target.value)} placeholder="e.g. \\\\server\\designs\\jig-12.SLDPRT or https://..." /></Field></div>
            <div className="col-span-2"><Field label="Description"><Textarea rows={2} value={form.description || ""} onChange={e=>setF("description", e.target.value)} /></Field></div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase tracking-wider text-slate-600">Components</Label>
              <Button size="sm" variant="outline" className="rounded-sm" onClick={()=>setF("lines", [...(form.lines||[]), {item_id:"",item_name:"",qty:1,uom:"pcs"}])}>+ Add</Button>
            </div>
            <div className="border border-slate-200">
              <table className="w-full text-sm">
                <thead><tr><Th>Item</Th><Th>Qty</Th><Th>UOM</Th><Th></Th></tr></thead>
                <tbody>
                  {(form.lines || []).map((l, i) => (
                    <tr key={i}>
                      <Td>
                        <Select value={l.item_id || ""} onValueChange={(v)=>setLineItem(i, v)}>
                          <SelectTrigger className="rounded-sm h-8"><SelectValue placeholder="Choose item" /></SelectTrigger>
                          <SelectContent>{invItems.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </Td>
                      <Td><Input type="number" value={l.qty} onChange={e=>setLine(i,"qty",Number(e.target.value))} className="rounded-sm h-8 w-24" /></Td>
                      <Td><Input value={l.uom} onChange={e=>setLine(i,"uom",e.target.value)} className="rounded-sm h-8 w-20" /></Td>
                      <Td><Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>setF("lines", form.lines.filter((_,j)=>j!==i))}><X className="h-4 w-4 text-red-600" /></Button></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="save-bom">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
