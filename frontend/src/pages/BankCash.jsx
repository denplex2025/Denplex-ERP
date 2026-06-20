import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark, Wallet, Plus, Trash2, X, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Fld = ({ label, children }) => (<div><Label className="text-[11px] uppercase tracking-wider text-slate-500">{label}</Label><div className="mt-1">{children}</div></div>);

export default function BankCash() {
  const [tab, setTab] = useState("accounts");
  const [accts, setAccts] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);
  const [ledger, setLedger] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([api.get("/accounts"), api.get("/cheques")]);
      setAccts(a.data || []); setCheques(c.data || []);
    } catch (e) { toast.error("Could not load accounts"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openLedger = async (acct) => {
    try { const r = await api.get(`/accounts/${acct.id}/ledger`); setLedger(r.data); }
    catch (e) { toast.error("Could not load ledger"); }
  };

  const del = async (a) => {
    if (!window.confirm(`Delete account "${a.name}"?`)) return;
    try { await api.delete(`/accounts/${a.id}`); setAccts(x => x.filter(y => y.id !== a.id)); toast.success("Deleted"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed (admin/manager only)"); }
  };

  const setChequeStatus = async (ch, status) => {
    try { await api.put(`/cheques/${ch.coll}/${ch.id}/status`, { cheque_status: status }); setCheques(cs => cs.map(c => c.id === ch.id ? { ...c, cheque_status: status } : c)); }
    catch (e) { toast.error("Update failed"); }
  };

  const totalBal = accts.reduce((a, x) => a + (x.balance || 0), 0);

  if (ledger) return <Ledger data={ledger} onBack={() => setLedger(null)} />;

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Landmark className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">Cash & Bank</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">Your bank and cash accounts with live balances from receipts and payments, plus a cheque register.</p>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {[["accounts", "Accounts"], ["cheques", `Cheque Register (${cheques.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{l}</button>
        ))}
      </div>

      {tab === "accounts" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-slate-500">Total balance: <strong className="text-slate-900 font-mono-tech">{inr(totalBal)}</strong></div>
            <Button onClick={() => setEdit({ type: "bank", opening_balance: 0, is_default: false })} className="rounded-sm bg-red-600 hover:bg-red-700"><Plus className="h-4 w-4 mr-1" /> New Account</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {loading && <div className="text-slate-400 text-sm p-4">Loading…</div>}
            {accts.map(a => (
              <div key={a.id} className="border border-slate-200 rounded-md p-4 hover:shadow-sm transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {a.type === "cash" ? <Wallet className="h-4 w-4 text-emerald-600" /> : <Landmark className="h-4 w-4 text-blue-600" />}
                    <span className="font-semibold text-slate-800">{a.name}</span>
                    {a.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">default</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEdit(a)} className="text-xs text-slate-400 hover:text-slate-700">Edit</button>
                    <button onClick={() => del(a)} className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {a.type === "bank" && <div className="text-[11px] text-slate-400 mt-1">{a.bank_name} {a.account_no ? `· ${a.account_no}` : ""}</div>}
                <div className="mt-3 text-2xl font-mono-tech text-slate-900">{inr(a.balance)}</div>
                <button onClick={() => openLedger(a)} className="text-xs text-red-600 hover:underline mt-2">View ledger →</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "cheques" && (
        <div className="overflow-x-auto border border-slate-200 rounded-md">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="p-2">Date</th><th className="p-2">Ref</th><th className="p-2">Party</th><th className="p-2">Dir</th><th className="p-2">Cheque No</th><th className="p-2 text-right">Amount</th><th className="p-2">Status</th>
            </tr></thead>
            <tbody>
              {cheques.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">No cheque payments yet.</td></tr>}
              {cheques.map(ch => (
                <tr key={ch.id} className="border-t border-slate-100">
                  <td className="p-2 text-slate-500">{ch.date}</td><td className="p-2">{ch.code}</td><td className="p-2">{ch.party}</td>
                  <td className="p-2"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ch.direction === "in" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{ch.direction === "in" ? "Received" : "Paid"}</span></td>
                  <td className="p-2 text-slate-500">{ch.ref_no || "—"}</td>
                  <td className="p-2 text-right font-mono-tech">{inr(ch.amount)}</td>
                  <td className="p-2">
                    <select value={ch.cheque_status} onChange={e => setChequeStatus(ch, e.target.value)} className="text-xs border border-slate-200 rounded-sm px-1.5 py-1 bg-white">
                      <option>Pending</option><option>Cleared</option><option>Bounced</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <AccountModal acct={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function AccountModal({ acct, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", type: "bank", opening_balance: 0, opening_date: "", bank_name: "", account_no: "", ifsc: "", upi: "", is_default: false, ...acct });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const payload = { ...f, opening_balance: Number(f.opening_balance || 0) };
      if (f.id) await api.put(`/accounts/${f.id}`, payload); else await api.post("/accounts", payload);
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error("Save failed"); }
    setSaving(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">{f.id ? "Edit Account" : "New Account"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Type"><select value={f.type} onChange={e => set("type", e.target.value)} className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white"><option value="bank">Bank</option><option value="cash">Cash</option></select></Fld>
            <Fld label="Opening Balance"><Input type="number" value={f.opening_balance} onChange={e => set("opening_balance", e.target.value)} /></Fld>
          </div>
          <Fld label="Account Name *"><Input value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Denplex - IndusInd" /></Fld>
          {f.type === "bank" && <>
            <Fld label="Bank Name"><Input value={f.bank_name} onChange={e => set("bank_name", e.target.value)} /></Fld>
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Account No"><Input value={f.account_no} onChange={e => set("account_no", e.target.value)} /></Fld>
              <Fld label="IFSC"><Input value={f.ifsc} onChange={e => set("ifsc", e.target.value)} /></Fld>
            </div>
            <Fld label="UPI"><Input value={f.upi} onChange={e => set("upi", e.target.value)} /></Fld>
          </>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.is_default} onChange={e => set("is_default", e.target.checked)} className="accent-red-600" /> Set as default account</label>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <Button variant="outline" className="rounded-sm" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="rounded-sm bg-red-600 hover:bg-red-700">{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

function Ledger({ data, onBack }) {
  return (
    <div className="pb-10">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ChevronLeft className="h-4 w-4" /> Back to accounts</button>
      <h1 className="text-xl font-bold font-display mb-1">{data.account?.name} — Ledger</h1>
      <div className="text-sm text-slate-500 mb-4">Opening {inr(data.opening_balance)} · Closing <strong className="text-slate-900 font-mono-tech">{inr(data.closing_balance)}</strong></div>
      <div className="overflow-x-auto border border-slate-200 rounded-md">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="p-2">Date</th><th className="p-2">Ref</th><th className="p-2">Particulars</th><th className="p-2">Mode</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th><th className="p-2 text-right">Balance</th>
          </tr></thead>
          <tbody>
            {(!data.rows || data.rows.length === 0) && <tr><td colSpan={7} className="p-6 text-center text-slate-400">No movements.</td></tr>}
            {data.rows && data.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="p-2 text-slate-500">{r.date}</td><td className="p-2">{r.ref}</td><td className="p-2">{r.particulars}</td><td className="p-2 text-slate-500">{r.mode}</td>
                <td className="p-2 text-right font-mono-tech">{r.debit ? inr(r.debit) : ""}</td>
                <td className="p-2 text-right font-mono-tech">{r.credit ? inr(r.credit) : ""}</td>
                <td className="p-2 text-right font-mono-tech font-medium">{inr(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
