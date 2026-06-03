import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Card, Th, Td, Empty, fmtDate } from "@/components/erp/Primitives";
import { Plus, Edit, Trash2, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import MaterialStates from "@/components/erp/MaterialStates";
import { toast } from "sonner";

export default function Inventory() {
  const [tab, setTab] = useState("items");
  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ uom: "pcs", gst_rate: 18, category: "raw" });
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveForm, setMoveForm] = useState({ type: "in", qty: 0 });
  const [scanOpen, setScanOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const load = async () => {
    const [a, b] = await Promise.all([api.get("/inventory/items"), api.get("/inventory/movements")]);
    setItems(a.data); setMoves(b.data);
  };
  useEffect(() => { load(); }, []);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const save = async () => {
    try {
      if (editing) await api.put(`/inventory/items/${editing.id}`, form);
      else await api.post("/inventory/items", form);
      toast.success(editing ? "Updated" : "Created");
      setOpen(false); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (it) => {
    if (!window.confirm("Delete this item?")) return;
    try { await api.delete(`/inventory/items/${it.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const openMove = (it, type) => { setMoveForm({ type, qty: 0, item_id: it.id, item_sku: it.sku, item_name: it.name }); setMoveOpen(true); };
  const saveMove = async () => {
    try {
      await api.post("/inventory/movements", { ...moveForm, qty: Number(moveForm.qty) });
      toast.success("Stock updated"); setMoveOpen(false); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const fileToB64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const onScanFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setScanLoading(true); setScanResult(null);
    try {
      const b64 = await fileToB64(f);
      const r = await api.post("/inventory/scan-bill", { image_base64: b64, mime: f.type });
      setScanResult(r.data.extracted);
      toast.success("Bill extracted — review below");
    } catch (e) { toast.error(e?.response?.data?.detail || "Scan failed"); }
    finally { setScanLoading(false); }
  };

  const addScannedToStock = async () => {
    if (!scanResult?.items?.length) { toast.error("No items in scan"); return; }
    let added = 0;
    for (const li of scanResult.items) {
      const desc = (li.description || "").trim();
      if (!desc) continue;
      let existing = items.find(i => i.name.toLowerCase() === desc.toLowerCase());
      if (!existing) {
        try {
          const sku = `AUTO-${Date.now().toString(36).toUpperCase()}-${added}`;
          const created = await api.post("/inventory/items", {
            sku, name: desc, uom: li.uom || "pcs", unit_cost: Number(li.rate) || 0,
            hsn: li.hsn || "", gst_rate: Number(li.gst_rate) || 18, qty_on_hand: 0, qty_in_process: 0, reorder_level: 0, category: "raw"
          });
          existing = created.data;
        } catch (e) { continue; }
      }
      try {
        await api.post("/inventory/movements", { item_id: existing.id, item_sku: existing.sku, item_name: existing.name, type: "in", qty: Number(li.qty) || 0, ref: scanResult.bill_number || "AI-SCAN", notes: `From supplier ${scanResult.supplier_name || ""}` });
        added++;
      } catch {}
    }
    toast.success(`Added ${added} items to stock`);
    setScanOpen(false); setScanResult(null); await load();
  };

  return (
    <div data-testid="inventory-page">
      <PageHeader
        overline="Materials"
        title="Inventory"
        subtitle="Stock in/out/adjust, in-process tracking, and AI-powered bill scanning."
        actions={
          <>
            <Button variant="outline" className="rounded-sm border-slate-300" onClick={() => setScanOpen(true)} data-testid="scan-bill-button">
              <Sparkles className="h-4 w-4 mr-1 text-red-600" /> Scan bill (AI)
            </Button>
            <Button onClick={() => { setEditing(null); setForm({ uom: "pcs", gst_rate: 18, category: "raw" }); setOpen(true); }} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="new-item-button">
              <Plus className="h-4 w-4 mr-1" /> New Item
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
       <TabsList className="rounded-sm bg-slate-100 mb-4">
          <TabsTrigger value="items" className="rounded-sm" data-testid="tab-items">Items</TabsTrigger>
          <TabsTrigger value="moves" className="rounded-sm" data-testid="tab-movements">Movements</TabsTrigger>
          <TabsTrigger value="material_states" className="rounded-sm" data-testid="tab-material-states">Material States</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <Card>
            {items.length === 0 ? <Empty label="No items. Add your first." /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <Th>SKU</Th><Th>Name</Th><Th>Category</Th><Th>On Hand</Th><Th>In Process</Th><Th>Reorder</Th><Th>Cost</Th><Th>GST%</Th><Th className="text-right">Actions</Th>
                  </tr></thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} className="hover:bg-slate-50">
                        <Td><span className="font-mono-tech text-xs">{it.sku}</span></Td>
                        <Td>{it.name}</Td>
                        <Td className="capitalize">{it.category}</Td>
                        <Td><span className={`font-mono-tech ${it.qty_on_hand <= it.reorder_level ? "text-red-700 font-semibold" : ""}`}>{it.qty_on_hand} {it.uom}</span></Td>
                        <Td><span className="font-mono-tech text-amber-700">{it.qty_in_process || 0}</span></Td>
                        <Td><span className="font-mono-tech">{it.reorder_level}</span></Td>
                        <Td>₹{it.unit_cost}</Td>
                        <Td>{it.gst_rate}%</Td>
                        <Td className="text-right whitespace-nowrap">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openMove(it, "in")} title="Stock In" data-testid={`stock-in-${it.id}`}><ArrowDownToLine className="h-4 w-4 text-emerald-700" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openMove(it, "out")} title="Stock Out" data-testid={`stock-out-${it.id}`}><ArrowUpFromLine className="h-4 w-4 text-red-700" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openMove(it, "adjust")} title="Adjust"><RefreshCw className="h-4 w-4 text-red-600" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(it); setForm(it); setOpen(true); }}><Edit className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(it)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="moves">
          <Card>
            {moves.length === 0 ? <Empty label="No movements yet." /> : (
              <table className="w-full">
                <thead><tr><Th>Date</Th><Th>Item</Th><Th>Type</Th><Th>Qty</Th><Th>Ref</Th><Th>By</Th><Th>Notes</Th></tr></thead>
                <tbody>
                  {moves.map(m => (
                    <tr key={m.id}>
                      <Td>{fmtDate(m.created_at)}</Td>
                      <Td>{m.item_name} <span className="text-xs text-slate-500 font-mono-tech">({m.item_sku})</span></Td>
                      <Td className="uppercase text-xs font-semibold">{m.type}</Td>
                      <Td><span className="font-mono-tech">{m.qty}</span></Td>
                      <Td className="font-mono-tech text-xs">{m.ref || "—"}</Td>
                      <Td>{m.by_user}</Td>
                      <Td className="text-slate-500">{m.notes}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="material_states">
          <MaterialStates />
        </TabsContent>
      </Tabs>

      {/* Item dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Edit" : "New"} Item</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU *"><Input value={form.sku || ""} onChange={e=>setF("sku", e.target.value)} data-testid="item-sku" /></Field>
            <Field label="Name *"><Input value={form.name || ""} onChange={e=>setF("name", e.target.value)} data-testid="item-name" /></Field>
            <Field label="Category">
              <Select value={form.category || "raw"} onValueChange={v=>setF("category", v)}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="raw">Raw Material</SelectItem>
                  <SelectItem value="wip">Work in Progress</SelectItem>
                  <SelectItem value="finished">Finished Goods</SelectItem>
                  <SelectItem value="tool">Tool</SelectItem>
                  <SelectItem value="consumable">Consumable</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="UOM"><Input value={form.uom || "pcs"} onChange={e=>setF("uom", e.target.value)} /></Field>
            <Field label="Qty on Hand"><Input type="number" value={form.qty_on_hand ?? 0} onChange={e=>setF("qty_on_hand", Number(e.target.value))} /></Field>
            <Field label="Reorder Level"><Input type="number" value={form.reorder_level ?? 0} onChange={e=>setF("reorder_level", Number(e.target.value))} /></Field>
            <Field label="Unit Cost (₹)"><Input type="number" value={form.unit_cost ?? 0} onChange={e=>setF("unit_cost", Number(e.target.value))} /></Field>
            <Field label="GST %"><Input type="number" value={form.gst_rate ?? 18} onChange={e=>setF("gst_rate", Number(e.target.value))} /></Field>
            <Field label="HSN"><Input value={form.hsn || ""} onChange={e=>setF("hsn", e.target.value)} /></Field>
            <Field label="Location"><Input value={form.location || ""} onChange={e=>setF("location", e.target.value)} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-item-button">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display capitalize">{moveForm.type} — {moveForm.item_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Type">
              <Select value={moveForm.type} onValueChange={v=>setMoveForm(p=>({...p, type:v}))}>
                <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock In</SelectItem>
                  <SelectItem value="out">Stock Out</SelectItem>
                  <SelectItem value="adjust">Adjust (set qty)</SelectItem>
                  <SelectItem value="in_process">Move to In-Process</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quantity"><Input type="number" value={moveForm.qty} onChange={e=>setMoveForm(p=>({...p, qty: e.target.value}))} data-testid="move-qty" /></Field>
            <Field label="Reference"><Input value={moveForm.ref || ""} onChange={e=>setMoveForm(p=>({...p, ref: e.target.value}))} /></Field>
            <Field label="Notes"><Textarea value={moveForm.notes || ""} onChange={e=>setMoveForm(p=>({...p, notes: e.target.value}))} rows={2} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button onClick={saveMove} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="save-move-button">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill scan dialog */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="rounded-sm max-w-3xl">
          <DialogHeader><DialogTitle className="font-display"><Sparkles className="inline h-4 w-4 mr-1 text-red-600" /> AI Bill Scanner</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">Upload a photo / scan of a supplier purchase bill. Claude will extract supplier, items, qty, rate, GST and totals. Review and confirm to add stock.</p>
          <div className="border-2 border-dashed border-slate-300 rounded-sm p-6 text-center">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onScanFile} className="hidden" id="bill-file" data-testid="bill-scan-input" />
            <label htmlFor="bill-file" className="cursor-pointer text-sm text-red-600 hover:underline">
              {scanLoading ? <span className="inline-flex items-center"><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Extracting...</span> : "Click to upload bill image"}
            </label>
          </div>
          {scanResult && (
            <div className="border border-slate-200 p-4 max-h-72 overflow-auto text-sm">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><div className="text-xs uppercase tracking-wider text-slate-500">Supplier</div><div>{scanResult.supplier_name || "—"}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-slate-500">Bill #</div><div className="font-mono-tech">{scanResult.bill_number || "—"}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-slate-500">Date</div><div>{scanResult.bill_date || "—"}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-slate-500">Total</div><div className="font-mono-tech">₹{scanResult.total || 0}</div></div>
              </div>
              <table className="w-full text-xs">
                <thead><tr><Th>Item</Th><Th>HSN</Th><Th>Qty</Th><Th>Rate</Th><Th>GST%</Th></tr></thead>
                <tbody>
                  {(scanResult.items || []).map((l, i) => (
                    <tr key={i}><Td>{l.description}</Td><Td>{l.hsn}</Td><Td>{l.qty} {l.uom}</Td><Td>₹{l.rate}</Td><Td>{l.gst_rate}%</Td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => { setScanOpen(false); setScanResult(null); }}>Cancel</Button>
            {scanResult && <Button onClick={addScannedToStock} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="confirm-scan-add">Confirm & Add to Stock</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label>
    <div className="mt-1.5">{children}</div>
  </div>
);
