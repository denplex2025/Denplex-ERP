import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);

export default function WorkerProduction() {
  const [regs, setRegs] = useState([]);
  const [tid, setTid] = useState("");
  const [reg, setReg] = useState(null);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ date: today(), data: {} });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/registers").then((r) => {
      const list = (r.data || []).filter((x) => x.active !== false);
      const prod = list.filter((x) => /production/i.test(x.name) || x.frequency === "daily");
      setRegs(prod.length ? prod : list);
    }).catch(() => {});
  }, []);

  const pickReg = async (id) => {
    setTid(id); setForm({ date: today(), data: {} }); setEntries([]);
    const t = regs.find((x) => x.id === id); setReg(t || null);
    if (id) { try { const r = await api.get(`/registers/${id}/entries`); setEntries(r.data || []); } catch (e) { /* */ } }
  };

  const setCell = (k, v) => setForm((p) => ({ ...p, data: { ...p.data, [k]: v } }));

  const save = async () => {
    if (!tid) { toast.error("Pick a register first"); return; }
    setSaving(true);
    try {
      await api.post(`/registers/${tid}/entries`, { date: form.date, data: form.data });
      toast.success("Entry saved");
      const r = await api.get(`/registers/${tid}/entries`); setEntries(r.data || []);
      setForm({ date: today(), data: {} });
    } catch (e) { toast.error("Save failed"); }
    setSaving(false);
  };

  const cols = reg?.columns || [];
  const todays = entries.filter((e) => String(e.date || "").slice(0, 10) === form.date);

  return (
    <div>
      <h1 className="text-lg font-bold font-display mb-3">Daily Production</h1>
      <select value={tid} onChange={(e) => pickReg(e.target.value)} className="w-full h-12 border border-slate-200 rounded-lg px-3 bg-white mb-4 text-sm">
        <option value="">Select register…</option>
        {regs.map((r) => <option key={r.id} value={r.id}>{r.name}{r.department ? ` · ${r.department}` : ""}</option>)}
      </select>

      {reg && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <Label>Date</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="h-11 mb-3" />
          {cols.map((c) => (
            <div key={c.key} className="mb-3">
              <Label>{c.label}</Label>
              {c.type === "select"
                ? <select value={form.data[c.key] || ""} onChange={(e) => setCell(c.key, e.target.value)} className="w-full h-11 border border-slate-200 rounded-lg px-3 bg-white text-sm">
                    <option value=""></option>{(c.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                : c.type === "textarea"
                ? <textarea value={form.data[c.key] || ""} onChange={(e) => setCell(c.key, e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                : <Input type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"} value={form.data[c.key] || ""} onChange={(e) => setCell(c.key, e.target.value)} className="h-11" />}
            </div>
          ))}
          <Button onClick={save} disabled={saving} className="w-full h-12 rounded-lg bg-red-600 hover:bg-red-700 text-base mt-1">{saving ? "Saving…" : "Save Entry"}</Button>
        </div>
      )}

      {reg && (
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Today's entries · {todays.length}</div>
          {todays.length === 0 && <div className="text-sm text-slate-400">No entries yet today.</div>}
          {todays.map((e, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 mb-2 text-sm">
              {cols.slice(0, 4).map((c) => (
                <div key={c.key} className="flex justify-between gap-3 py-0.5">
                  <span className="text-slate-500">{c.label}</span>
                  <span className="font-medium text-right">{String(e.data?.[c.key] ?? "—")}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const Label = ({ children }) => <label className="text-[11px] uppercase tracking-wider text-slate-500">{children}</label>;
