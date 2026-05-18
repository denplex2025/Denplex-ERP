import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Card, Empty, Th, Td, fmtDate } from "@/components/erp/Primitives";
import { Plus, Edit, Trash2, Upload, Sparkles, MessageCircle } from "lucide-react";
import { toast } from "sonner";

/** Generic record dialog form */
function FieldEditor({ field, value, onChange, allItems }) {
  const id = `f-${field.name}`;
  const common = { id, value: value ?? "", onChange: (e) => onChange(field.name, e.target.value), className: "rounded-sm border-slate-300", "data-testid": `field-${field.name}` };
  if (field.type === "select") {
    return (
      <Select value={value ?? ""} onValueChange={(v) => onChange(field.name, v)}>
        <SelectTrigger className="rounded-sm border-slate-300" data-testid={`field-${field.name}`}><SelectValue placeholder={field.label} /></SelectTrigger>
        <SelectContent>
          {field.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "textarea") return <Textarea {...common} rows={3} />;
  if (field.type === "number") return <Input {...common} type="number" step="any" onChange={(e) => onChange(field.name, e.target.value === "" ? "" : Number(e.target.value))} />;
  if (field.type === "date") return <Input {...common} type="date" />;
  return <Input {...common} />;
}

export function CrudPage({
  testid,
  overline, title, subtitle,
  endpoint,
  fields,           // [{name,label,type,options?,required?,full?}]
  columns,          // [{key,label,render?}]
  rowActions,       // optional fn(row)=>node
  defaults = {},
  rolesCanCreate,   // optional array
  extraTopActions,  // optional jsx
  emptyLabel,
  whatsappField,    // field name to enable click-to-WhatsApp
  onAfterChange,    // optional callback
}) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaults);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try { const r = await api.get(endpoint); setItems(r.data); }
    catch (e) { toast.error("Failed to load"); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(defaults); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...defaults, ...row }); setOpen(true); };

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setLoading(true);
    try {
      if (editing) await api.put(`${endpoint}/${editing.id}`, form);
      else await api.post(endpoint, form);
      toast.success(editing ? "Updated" : "Created");
      setOpen(false); await load(); onAfterChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setLoading(false); }
  };

  const del = async (row) => {
    if (!window.confirm("Delete this record?")) return;
    try { await api.delete(`${endpoint}/${row.id}`); toast.success("Deleted"); await load(); onAfterChange?.(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  return (
    <div data-testid={testid}>
      <PageHeader
        overline={overline}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {extraTopActions}
            <Button onClick={openCreate} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid={`${testid}-new`}>
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </>
        }
      />

      <Card>
        {items.length === 0 ? (
          <Empty label={emptyLabel || "No records yet."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {columns.map(c => <Th key={c.key}>{c.label}</Th>)}
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    {columns.map(c => <Td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? "—")}</Td>)}
                    <Td className="text-right whitespace-nowrap">
                      {whatsappField && row[whatsappField] && (
                        <a href={`https://wa.me/${String(row[whatsappField]).replace(/\D/g,'')}`} target="_blank" rel="noreferrer">
                          <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" data-testid={`row-whatsapp-${row.id}`}>
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                        </a>
                      )}
                      {rowActions?.(row)}
                      <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => openEdit(row)} data-testid={`row-edit-${row.id}`}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="rounded-sm h-8 w-8" onClick={() => del(row)} data-testid={`row-delete-${row.id}`}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl" data-testid={`${testid}-dialog`}>
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">{editing ? "Edit" : "New"} {title.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map(f => (
              <div key={f.name} className={f.full ? "md:col-span-2" : ""}>
                <Label className="text-xs uppercase tracking-wider text-slate-600">{f.label}{f.required && " *"}</Label>
                <div className="mt-1.5">
                  <FieldEditor field={f} value={form[f.name]} onChange={setField} />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={loading} className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid={`${testid}-save`}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    new: "bg-blue-50 text-blue-700 border-blue-200",
    contacted: "bg-amber-50 text-amber-700 border-amber-200",
    qualified: "bg-violet-50 text-violet-700 border-violet-200",
    converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
    lost: "bg-red-50 text-red-700 border-red-200",
    planned: "bg-slate-50 text-slate-700 border-slate-200",
    in_progress: "bg-blue-50 text-blue-700 border-blue-200",
    qc: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    on_hold: "bg-orange-50 text-orange-700 border-orange-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-slate-50 text-slate-700 border-slate-200",
    done: "bg-emerald-50 text-emerald-700 border-emerald-200",
    draft: "bg-slate-50 text-slate-700 border-slate-200",
    sent: "bg-blue-50 text-blue-700 border-blue-200",
    accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    received: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    overdue: "bg-red-50 text-red-700 border-red-200",
    pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    fail: "bg-red-50 text-red-700 border-red-200",
    rework: "bg-amber-50 text-amber-700 border-amber-200",
    repeat: "bg-violet-50 text-violet-700 border-violet-200",
    one_time: "bg-slate-50 text-slate-700 border-slate-200",
  };
  const cls = map[status] || "bg-slate-50 text-slate-700 border-slate-200";
  return <Badge className={`rounded-sm uppercase text-[10px] tracking-wider border ${cls}`}>{status}</Badge>;
}
