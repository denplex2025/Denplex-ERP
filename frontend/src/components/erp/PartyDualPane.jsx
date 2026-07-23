import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Empty } from "@/components/erp/Primitives";
import { PartyLedgerPanel } from "@/components/erp/PartyLedgerSheet";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

function FieldEditor({ field, value, onChange }) {
  const id = `f-${field.name}`;
  const common = { id, value: value ?? "", onChange: (e) => onChange(field.name, e.target.value), className: "rounded-sm border-slate-300" };
  if (field.type === "select") {
    return (
      <Select value={value ?? ""} onValueChange={(v) => onChange(field.name, v)}>
        <SelectTrigger className="rounded-sm border-slate-300"><SelectValue placeholder={field.label} /></SelectTrigger>
        <SelectContent>
          {field.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "textarea") return <Textarea {...common} rows={3} />;
  return <Input {...common} />;
}

/** Master-detail (left list / right ledger) layout for Customers & Suppliers, replacing the old
 * single table + slide-over drawer. The right pane reuses PartyLedgerPanel (with its built-in
 * Type/Number/Date/Total/Balance/Due-Date/Status filters) so filtering logic lives in one place. */
export function PartyDualPane({ testid, overline, title, subtitle, endpoint, kind, fields, defaults = {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaults);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get(endpoint); setItems(r.data); }
    catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(defaults); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...defaults, ...row }); setOpen(true); };
  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      if (editing) await api.put(`${endpoint}/${editing.id}`, form);
      else await api.post(endpoint, form);
      toast.success(editing ? "Updated" : "Created");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async (row) => {
    if (!window.confirm("Delete this record?")) return;
    try {
      await api.delete(`${endpoint}/${row.id}`);
      toast.success("Deleted");
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = items.filter((r) => !q
    || (r.name || "").toLowerCase().includes(q)
    || (r.gstin || "").toLowerCase().includes(q)
    || (r.phone || "").includes(q)
    || (r.code || "").toLowerCase().includes(q));

  return (
    <div data-testid={testid}>
      <PageHeader
        overline={overline}
        title={title}
        subtitle={subtitle}
        actions={
          <Button onClick={openCreate} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid={`${testid}-new`}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-slate-200">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <Input
                placeholder="Search name, GSTIN, phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-sm border-slate-300 pl-8 h-8 text-sm"
                data-testid={`${testid}-search`}
              />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
            ) : filtered.length === 0 ? (
              <Empty label="No parties found." />
            ) : (
              filtered.map((row) => (
                <div
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`px-3 py-2.5 border-b border-slate-100 cursor-pointer flex items-center justify-between gap-2 ${
                    selectedId === row.id ? "bg-red-50 border-l-2 border-l-red-600" : "hover:bg-slate-50"
                  }`}
                  data-testid={`party-row-${row.id}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{row.name}</div>
                    <div className="text-xs text-slate-500 truncate">{row.gstin || row.phone || "—"}</div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <Button size="icon" variant="ghost" className="rounded-sm h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(row); }} data-testid={`row-edit-${row.id}`}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="rounded-sm h-7 w-7" onClick={(e) => { e.stopPropagation(); del(row); }} data-testid={`row-delete-${row.id}`}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5 min-h-[400px]">
          <PartyLedgerPanel
            pid={selectedId}
            kind={kind}
            onEdit={(party) => openEdit(items.find((i) => i.id === party.id) || party)}
            onDelete={(party) => del(items.find((i) => i.id === party.id) || party)}
          />
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl" data-testid={`${testid}-dialog`}>
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">{editing ? "Edit" : "New"} {title.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((f) => (
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
            <Button onClick={save} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid={`${testid}-save`}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
