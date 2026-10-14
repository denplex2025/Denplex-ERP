import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, Card, Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { Plus, Trash2, Eye, FileText, Hammer, PackageCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Job Work Out — our material leaving the shop for an outside operation, and what has come back.
 *
 * Two tabs, because they answer two different questions:
 *  - Challans: the documents themselves (create, edit, record returns, print)
 *  - Outstanding: what is sitting at each job worker RIGHT NOW, which is the reason the
 *    document exists at all. Backed by GET /job-work-out/outstanding.
 *
 * Not a purchase: material sent for job work travels on a challan under GST Rule 55 / ITC-04 and
 * stays ours throughout, so nothing here is taxed and nothing posts to sales or purchases. The
 * job worker bills their labour separately as an ordinary Vendor Bill.
 */

const STATUS_STYLE = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  sent: "bg-amber-50 text-amber-700 border-amber-200",
  partially_returned: "bg-blue-50 text-blue-700 border-blue-200",
  returned: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-500 border-slate-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL = {
  draft: "Draft", sent: "Out", partially_returned: "Part returned",
  returned: "Returned", closed: "Closed", cancelled: "Cancelled",
};

// The operations Denplex actually sends out. Free text is still allowed — this is a shortcut,
// not a restriction, because a new process should never require a code change.
const PROCESSES = [
  "Grinding", "Centreless grinding", "Surface grinding", "Cylindrical grinding",
  "Zinc plating", "Nickel plating", "Hard chrome", "Powder coating", "Anodising",
  "Heat treatment", "Hardening", "Tempering", "Nitriding",
  "Wire-cut EDM", "EDM", "Laser cutting", "Waterjet", "Bending",
  "Turning", "Milling", "Boring", "Honing", "Lapping",
  "Buffing", "Polishing", "Shot blasting", "Painting", "Welding", "Fabrication",
];

const blankLine = () => ({
  description: "", item_code: "", hsn: "", process: "",
  qty_sent: 1, unit: "Nos", rate: 0, material_value: 0,
  qty_returned: 0, qty_rejected: 0, remarks: "",
});

const outstandingOf = (l) =>
  Math.max(Number(l.qty_sent || 0) - Number(l.qty_returned || 0) - Number(l.qty_rejected || 0), 0);

export default function JobWorkOut() {
  const [tab, setTab] = useState("challans");
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outs, setOuts] = useState(null);
  const [outsLoading, setOutsLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);     // null = creating
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    supplier_id: "", supplier_name: "", process: "", date: new Date().toISOString().slice(0, 10),
    expected_return_date: "", reference: "", notes: "", status: "sent",
  });
  const [lines, setLines] = useState([blankLine()]);

  const [viewRow, setViewRow] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [j, s] = await Promise.all([api.get("/job-work-out"), api.get("/suppliers")]);
      setRows(j.data || []);
      setSuppliers(s.data || []);
    } catch { toast.error("Failed to load job work challans"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const loadOutstanding = async () => {
    setOutsLoading(true);
    try { const r = await api.get("/job-work-out/outstanding"); setOuts(r.data); }
    catch { toast.error("Failed to load outstanding report"); }
    finally { setOutsLoading(false); }
  };
  // Reload every time the tab is opened rather than caching: recording a return on the other
  // tab changes these numbers, and a stale "what's at Jyoti's" is worse than a slow one.
  useEffect(() => { if (tab === "outstanding") loadOutstanding(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((ls) => [...ls, blankLine()]);
  const delLine = (i) => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const openCreate = () => {
    setEditId(null);
    setF({ supplier_id: "", supplier_name: "", process: "", date: new Date().toISOString().slice(0, 10),
           expected_return_date: "", reference: "", notes: "", status: "sent" });
    setLines([blankLine()]);
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditId(row.id);
    setF({
      supplier_id: row.supplier_id || "", supplier_name: row.supplier_name || "",
      process: row.process || "", date: (row.date || "").slice(0, 10),
      expected_return_date: (row.expected_return_date || "").slice(0, 10),
      reference: row.reference || "", notes: row.notes || "", status: row.status || "sent",
    });
    setLines((row.lines || []).length ? row.lines.map((l) => ({ ...blankLine(), ...l })) : [blankLine()]);
    setOpen(true);
  };

  const totals = useMemo(() => {
    let labour = 0, matval = 0, sent = 0, out = 0;
    for (const l of lines) {
      const q = Number(l.qty_sent || 0);
      labour += q * Number(l.rate || 0);
      matval += q * Number(l.material_value || 0);
      sent += q;
      out += outstandingOf(l);
    }
    return { labour, matval, sent, out };
  }, [lines]);

  const save = async () => {
    if (saving) return;
    if (!f.supplier_id) { toast.error("Pick the job worker"); return; }
    if (!lines.some((l) => (l.description || "").trim() && Number(l.qty_sent) > 0)) {
      toast.error("Add at least one line with a description and quantity"); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...f,
        lines: lines
          .filter((l) => (l.description || "").trim())
          .map((l) => ({
            description: l.description, item_code: l.item_code, hsn: l.hsn,
            process: l.process || f.process || "",
            qty_sent: Number(l.qty_sent || 0), unit: l.unit || "Nos",
            rate: Number(l.rate || 0), material_value: Number(l.material_value || 0),
            qty_returned: Number(l.qty_returned || 0), qty_rejected: Number(l.qty_rejected || 0),
            remarks: l.remarks || "",
          })),
      };
      if (editId) await api.put(`/job-work-out/${editId}`, payload);
      else await api.post("/job-work-out", payload);
      toast.success(editId ? "Challan updated" : "Job Work Out challan created");
      setOpen(false);
      await load();
      if (outs) loadOutstanding();   // keep the other tab honest
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
    setSaving(false);
  };

  const del = async (row) => {
    if (!window.confirm(`Delete challan ${row.code}? This cannot be undone.`)) return;
    try {
      await api.delete(`/job-work-out/${row.id}`);
      toast.success("Deleted");
      load(); if (outs) loadOutstanding();
    } catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [rows]
  );

  return (
    <div data-testid="job-work-out-page">
      <PageHeader
        overline="Production"
        title="Job Work Out"
        subtitle="Material sent to an outside job worker, and what is still with them. Not a purchase — the material stays yours."
        actions={
          tab === "challans" && (
            <Button onClick={openCreate} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="jwo-new">
              <Plus className="h-4 w-4 mr-1" /> New Challan
            </Button>
          )
        }
      />

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {[["challans", "Challans", Hammer], ["outstanding", "Outstanding", PackageCheck]].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={`jwo-tab-${k}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === k ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "challans" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <Th>Challan</Th><Th>Date</Th><Th>Job worker</Th><Th>Process</Th>
                  <Th className="text-right">Sent</Th><Th className="text-right">Outstanding</Th>
                  <Th className="text-right">Labour</Th><Th>Status</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><Td className="py-6 text-slate-400" >Loading…</Td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={9}><Empty label="No job work challans yet. Create one when material goes out." /></td></tr>
                ) : sorted.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <Td>
                      <span className="font-medium">{r.code}</span>
                      {r.needs_review && (
                        <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                          check
                        </span>
                      )}
                    </Td>
                    <Td>{fmtDate(r.date)}</Td>
                    <Td>{r.supplier_name || <span className="text-slate-400">—</span>}</Td>
                    <Td className="text-slate-500">{r.process || "—"}</Td>
                    <Td className="text-right tabular-nums">{r.qty_sent_total ?? 0}</Td>
                    <Td className="text-right tabular-nums">
                      <span className={Number(r.qty_outstanding_total) > 0 ? "font-semibold text-amber-700" : "text-slate-400"}>
                        {r.qty_outstanding_total ?? 0}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{inr(r.labour_total || 0)}</Td>
                    <Td>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[r.status] || STATUS_STYLE.draft}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <button onClick={() => setViewRow(r)} title="View" className="p-1 text-slate-400 hover:text-slate-700">
                        <Eye className="h-4 w-4" />
                      </button>
                      <a href={`${api.defaults.baseURL}/job-work-out/${r.id}/pdf`} target="_blank" rel="noreferrer"
                         title="Print challan" className="inline-block p-1 text-slate-400 hover:text-slate-700">
                        <FileText className="h-4 w-4" />
                      </a>
                      <button onClick={() => openEdit(r)} title="Edit / record return"
                              className="px-1.5 text-xs font-medium text-red-700 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => del(r)} title="Delete" className="p-1 text-slate-300 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "outstanding" && (
        <>
          {outsLoading ? (
            <Card><div className="p-6 text-sm text-slate-400">Loading…</div></Card>
          ) : !outs || !(outs.by_supplier || []).length ? (
            <Card><Empty label="Nothing is out at a job worker right now." /></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Card className="p-3">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Pieces outstanding</div>
                  <div className="text-2xl font-bold text-amber-700 tabular-nums">{outs.total_qty_outstanding}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Declared material value out</div>
                  <div className="text-2xl font-bold tabular-nums">{inr(outs.total_material_value)}</div>
                </Card>
              </div>
              {outs.by_supplier.map((s) => (
                <Card key={s.supplier_id || s.supplier_name} className="mb-3">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                    <div>
                      <span className="font-semibold">{s.supplier_name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {s.challans} challan{s.challans === 1 ? "" : "s"}
                        {s.oldest_date ? ` · oldest ${fmtDate(s.oldest_date)}` : ""}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-amber-700 tabular-nums">{s.qty_outstanding}</span>
                      <span className="text-slate-400"> pcs · </span>
                      <span className="tabular-nums">{inr(s.material_value)}</span>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400">
                        <Th>Challan</Th><Th>Date</Th><Th>Item</Th><Th>Process</Th><Th className="text-right">Outstanding</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.items.map((it, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <Td>{it.code}</Td>
                          <Td>{fmtDate(it.date)}</Td>
                          <Td>{it.description}</Td>
                          <Td className="text-slate-500">{it.process || "—"}</Td>
                          <Td className="text-right tabular-nums">{it.qty_outstanding} {it.unit}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {/* ---------------- create / edit ---------------- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Job Work Challan" : "New Job Work Out Challan"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">Job worker *</Label>
              <select
                value={f.supplier_id}
                onChange={(e) => {
                  const s = suppliers.find((x) => (x.id || x._id) === e.target.value);
                  setF((p) => ({ ...p, supplier_id: e.target.value, supplier_name: s?.name || "" }));
                }}
                className="w-full mt-1 h-9 border border-slate-300 rounded-md px-2 text-sm bg-white"
                data-testid="jwo-supplier"
              >
                <option value="">— Select job worker —</option>
                {suppliers.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">Date</Label>
              <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">Expected back</Label>
              <Input type="date" value={f.expected_return_date}
                     onChange={(e) => set("expected_return_date", e.target.value)} className="mt-1 h-9" />
            </div>
            <div className="col-span-2">
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">Process (applies to all lines unless set per line)</Label>
              <Input list="jwo-processes" value={f.process} onChange={(e) => set("process", e.target.value)}
                     placeholder="e.g. Centreless grinding" className="mt-1 h-9" />
              <datalist id="jwo-processes">{PROCESSES.map((p) => <option key={p} value={p} />)}</datalist>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">Reference</Label>
              <Input value={f.reference} onChange={(e) => set("reference", e.target.value)}
                     placeholder="their DC / our WO" className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-slate-500">Status</Label>
              <select value={f.status} onChange={(e) => set("status", e.target.value)}
                      className="w-full mt-1 h-9 border border-slate-300 rounded-md px-2 text-sm bg-white">
                <option value="draft">Draft</option>
                <option value="sent">Out</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 -mt-1">
            Out / part-returned / returned is worked out from the quantities below — you don&apos;t set it here.
          </p>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <Th>Item / description *</Th><Th>Process</Th>
                  <Th className="text-right">Sent *</Th><Th>Unit</Th>
                  <Th className="text-right">Rate ₹</Th><Th className="text-right">Material ₹</Th>
                  <Th className="text-right">Returned</Th><Th className="text-right">Rejected</Th>
                  <Th className="text-right">Out</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <Td><Input value={l.description} onChange={(e) => setLine(i, "description", e.target.value)}
                               className="h-8 min-w-[200px]" placeholder="SS304 ring 310 OD" /></Td>
                    <Td><Input list="jwo-processes" value={l.process} onChange={(e) => setLine(i, "process", e.target.value)}
                               className="h-8 w-32" placeholder={f.process || "—"} /></Td>
                    <Td><Input type="number" step="any" value={l.qty_sent} onChange={(e) => setLine(i, "qty_sent", e.target.value)}
                               className="h-8 w-20 text-right tabular-nums" /></Td>
                    <Td><Input value={l.unit} onChange={(e) => setLine(i, "unit", e.target.value)} className="h-8 w-16" /></Td>
                    <Td><Input type="number" step="any" value={l.rate} onChange={(e) => setLine(i, "rate", e.target.value)}
                               className="h-8 w-20 text-right tabular-nums" /></Td>
                    <Td><Input type="number" step="any" value={l.material_value} onChange={(e) => setLine(i, "material_value", e.target.value)}
                               className="h-8 w-24 text-right tabular-nums" /></Td>
                    <Td><Input type="number" step="any" value={l.qty_returned} onChange={(e) => setLine(i, "qty_returned", e.target.value)}
                               className="h-8 w-20 text-right tabular-nums" /></Td>
                    <Td><Input type="number" step="any" value={l.qty_rejected} onChange={(e) => setLine(i, "qty_rejected", e.target.value)}
                               className="h-8 w-20 text-right tabular-nums" /></Td>
                    <Td className="text-right tabular-nums font-medium">
                      <span className={outstandingOf(l) > 0 ? "text-amber-700" : "text-slate-400"}>{outstandingOf(l)}</span>
                    </Td>
                    <Td className="text-right">
                      <button onClick={() => delLine(i)} className="p-1 text-slate-300 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-2">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
            <div className="text-sm text-slate-600">
              <span className="mr-4">Sent <span className="font-semibold tabular-nums">{totals.sent}</span></span>
              <span className="mr-4">Outstanding <span className="font-semibold tabular-nums text-amber-700">{totals.out}</span></span>
              <span className="mr-4">Labour <span className="font-semibold tabular-nums">{inr(totals.labour)}</span></span>
              <span>Material <span className="font-semibold tabular-nums">{inr(totals.matval)}</span></span>
            </div>
          </div>

          <div className="mt-2">
            <Label className="text-[11px] uppercase tracking-wider text-slate-500">Notes</Label>
            <Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className="mt-1" />
          </div>

          <p className="text-[11px] text-slate-500">
            Material value is declared for the challan only — it is not a sale and not a purchase. The job
            worker&apos;s labour bill is entered separately as a Purchase Bill.
          </p>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="jwo-save">
              {saving ? "Saving…" : editId ? "Save changes" : "Create challan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- view ---------------- */}
      <Dialog open={!!viewRow} onOpenChange={(v) => !v && setViewRow(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{viewRow?.code}</DialogTitle></DialogHeader>
          {viewRow && (
            <div className="text-sm space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">Job worker:</span> {viewRow.supplier_name || "—"}</div>
                <div><span className="text-slate-500">Date:</span> {fmtDate(viewRow.date)}</div>
                <div><span className="text-slate-500">Process:</span> {viewRow.process || "—"}</div>
                <div><span className="text-slate-500">Expected back:</span> {viewRow.expected_return_date ? fmtDate(viewRow.expected_return_date) : "—"}</div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-slate-400">
                    <Th>Item</Th><Th>Process</Th><Th className="text-right">Sent</Th>
                    <Th className="text-right">Returned</Th><Th className="text-right">Rejected</Th><Th className="text-right">Out</Th>
                  </tr>
                </thead>
                <tbody>
                  {(viewRow.lines || []).map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <Td>{l.description}</Td>
                      <Td className="text-slate-500">{l.process || viewRow.process || "—"}</Td>
                      <Td className="text-right tabular-nums">{l.qty_sent} {l.unit}</Td>
                      <Td className="text-right tabular-nums">{l.qty_returned || 0}</Td>
                      <Td className="text-right tabular-nums">{l.qty_rejected || 0}</Td>
                      <Td className="text-right tabular-nums font-medium">{outstandingOf(l)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {viewRow.notes && <div className="text-slate-600"><span className="text-slate-500">Notes:</span> {viewRow.notes}</div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setViewRow(null)}>Close</Button>
            <Button className="rounded-sm bg-red-600 hover:bg-red-700"
                    onClick={() => { const r = viewRow; setViewRow(null); openEdit(r); }}>
              Edit / record return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
