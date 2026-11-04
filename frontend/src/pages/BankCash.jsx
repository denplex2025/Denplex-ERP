import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark, Wallet, Plus, Trash2, X, ChevronLeft, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
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
  const [stmts, setStmts] = useState([]);
  const [upload, setUpload] = useState(false);
  const [stmtId, setStmtId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([api.get("/accounts"), api.get("/cheques")]);
      setAccts(a.data || []); setCheques(c.data || []);
    } catch (e) { toast.error("Could not load accounts"); }
    // Statements are a separate concern: if this 403s (sales/production have no accounts
    // access) the rest of the page must still render, so it gets its own try.
    try { const s = await api.get("/bank-statements"); setStmts(s.data || []); } catch (e) { /* no access */ }
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
  if (stmtId) return <StatementReport id={stmtId} onBack={() => { setStmtId(null); load(); }} />;

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Landmark className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">Cash & Bank</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">Your bank and cash accounts with live balances from receipts and payments, plus a cheque register.</p>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {[["accounts", "Accounts"], ["cheques", `Cheque Register (${cheques.length})`], ["statements", `Statements (${stmts.length})`]].map(([k, l]) => (
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

      {tab === "statements" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-slate-500">
              Upload a bank statement to see where the money actually went. Nothing here touches your
              ledger — no payments or expenses are created.
            </div>
            <Button onClick={() => setUpload(true)} className="rounded-sm bg-red-600 hover:bg-red-700 shrink-0 ml-4">
              <Upload className="h-4 w-4 mr-1" /> Upload Statement
            </Button>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="p-2">Account</th><th className="p-2">Period</th><th className="p-2">File</th>
                <th className="p-2 text-right">In</th><th className="p-2 text-right">Out</th>
                <th className="p-2 text-right">Rows</th><th className="p-2">Check</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {stmts.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-400">No statements uploaded yet.</td></tr>}
                {stmts.map(s => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2 font-medium text-slate-800">{s.account_name || "—"}</td>
                    <td className="p-2 text-slate-500">{s.period_from} → {s.period_to}
                      {s.opening_date && <span className="block text-[10px] text-slate-400">opening as on {s.opening_date}</span>}
                    </td>
                    <td className="p-2 text-slate-500 truncate max-w-[180px]" title={s.file_name}>{s.file_name}</td>
                    <td className="p-2 text-right font-mono-tech text-emerald-700">{inr(s.total_credit)}</td>
                    <td className="p-2 text-right font-mono-tech text-red-700">{inr(s.total_debit)}</td>
                    <td className="p-2 text-right text-slate-500">
                      {s.row_count}{s.unclear_count > 0 && <span className="text-amber-600"> · {s.unclear_count} unclear</span>}
                    </td>
                    <td className="p-2">
                      {s.reconciled
                        ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Tallies</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700" title={s.reconcile_note}><AlertTriangle className="h-3 w-3" /> Check</span>}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button onClick={() => setStmtId(s.id)} className="text-xs text-red-600 hover:underline">Report →</button>
                      <button onClick={async () => {
                        if (!window.confirm(`Delete this statement and its ${s.row_count} rows?`)) return;
                        try { await api.delete(`/bank-statements/${s.id}`); setStmts(x => x.filter(y => y.id !== s.id)); toast.success("Deleted"); }
                        catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
                      }} className="ml-3 text-slate-300 hover:text-red-600 align-middle"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {edit && <AccountModal acct={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {upload && <UploadStatementModal accts={accts} onClose={() => setUpload(false)} onSaved={() => { setUpload(false); load(); }} />}
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

// Upload is deliberately two steps: parse (server returns a preview, saves nothing) then save.
// A statement is an outside document — you look at what was read out of it BEFORE it is stored,
// and the reconciliation check tells you whether to trust it.
function UploadStatementModal({ accts, onClose, onSaved }) {
  const bankAccts = (accts || []).filter(a => a.type === "bank");
  const [acctId, setAcctId] = useState(bankAccts.find(a => a.is_default)?.id || bankAccts[0]?.id || "");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [openBal, setOpenBal] = useState("");
  const [openDate, setOpenDate] = useState("");

  const pick = (f) => {
    if (!f) return;
    setFile(f); setPreview(null);
  };

  const doParse = async () => {
    if (!acctId) { toast.error("Pick which bank account this statement belongs to"); return; }
    if (!file) { toast.error("Choose a file first"); return; }
    setBusy(true);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error("Could not read the file"));
        r.readAsDataURL(file);
      });
      const r = await api.post("/bank-statements/parse", {
        file_base64: b64, file_name: file.name, mime: file.type || "", account_id: acctId,
        opening_balance: openBal === "" ? null : Number(openBal),
        opening_date: openDate || "",
      });
      setPreview(r.data);
      if (r.data.opening_balance != null && openBal === "") setOpenBal(String(r.data.opening_balance));
      if (r.data.opening_date && !openDate) setOpenDate(r.data.opening_date);
      if (!r.data.reconciled) toast.warning("Parsed, but the totals do not tally — check before saving");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not read that statement");
    }
    setBusy(false);
  };

  const doSave = async () => {
    setBusy(true);
    try {
      await api.post("/bank-statements", {
        account_id: acctId, file_name: file?.name || "", source: preview.meta?.source || "csv",
        opening_date: openDate || preview.opening_date || "",
        opening_balance: Number((openBal !== "" ? openBal : preview.opening_balance) || 0),
        closing_balance: Number(preview.closing_balance || 0),
        rows: preview.rows,
      });
      toast.success(`Saved ${preview.row_count} transactions`);
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">Upload Bank Statement</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Bank Account *">
              <select value={acctId} onChange={e => { setAcctId(e.target.value); setPreview(null); }}
                      className="w-full h-9 text-sm border border-slate-200 rounded-sm px-2 bg-white">
                {bankAccts.length === 0 && <option value="">No bank accounts — add one first</option>}
                {bankAccts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Fld>
            <Fld label="File (CSV, Excel or PDF)">
              <input type="file" accept=".csv,.xls,.xlsx,.xlsm,.pdf,text/csv,application/pdf"
                     onChange={e => pick(e.target.files?.[0])}
                     className="w-full text-sm file:mr-2 file:px-2 file:py-1 file:text-xs file:rounded-sm file:border file:border-slate-200 file:bg-slate-50" />
            </Fld>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Opening Balance (optional)">
              <Input type="number" value={openBal} onChange={e => setOpenBal(e.target.value)}
                     placeholder="auto from the statement" />
            </Fld>
            <Fld label="Opening Balance As On">
              <Input type="date" value={openDate} onChange={e => setOpenDate(e.target.value)} />
            </Fld>
          </div>
          {preview?.suggested_opening && (
            <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-sm p-2">
              Previous statement for this account closed at{" "}
              <strong className="font-mono-tech">{inr(preview.suggested_opening.balance)}</strong>{" "}
              on {preview.suggested_opening.as_of}
              {preview.suggested_opening.from_file ? ` (${preview.suggested_opening.from_file})` : ""} —
              use that as this one's opening so the two line up.
              <button type="button" className="ml-2 text-red-600 hover:underline"
                      onClick={() => { setOpenBal(String(preview.suggested_opening.balance ?? ""));
                                       setOpenDate(preview.suggested_opening.as_of || ""); }}>
                Use it
              </button>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            Leave the opening balance blank and it is derived from the statement's own running
            balance. Set the date so the next upload can pick up exactly where this one ends.
            CSV and Excel are read exactly. A PDF is read from its table where it has one, and only
            falls back to AI when it does not — AI reading can misread a figure, so check the preview.
          </p>

          {!preview && (
            <Button onClick={doParse} disabled={busy || !file || !acctId} className="rounded-sm bg-slate-800 hover:bg-slate-900">
              <FileSpreadsheet className="h-4 w-4 mr-1" /> {busy ? "Reading…" : "Read statement"}
            </Button>
          )}

          {preview && (
            <>
              <div className={`rounded-md p-3 text-sm border ${preview.reconciled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-start gap-2">
                  {preview.reconciled
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    : <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />}
                  <div>
                    <div className={preview.reconciled ? "text-emerald-800 font-medium" : "text-amber-800 font-medium"}>
                      {preview.reconciled ? "Totals tally with the closing balance" : "Totals do NOT tally"}
                    </div>
                    <div className="text-slate-600 mt-0.5 font-mono-tech text-[12px]">
                      {inr(preview.opening_balance)} + {inr(preview.total_credit)} − {inr(preview.total_debit)} = {inr(preview.closing_balance)}
                    </div>
                    {preview.reconcile_note && <div className="text-amber-800 mt-1 text-[12px]">{preview.reconcile_note}</div>}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <span><strong className="text-slate-900">{preview.row_count}</strong> transactions</span>
                <span>{preview.period_from} → {preview.period_to}</span>
                <span>read as <strong>{preview.meta?.source || "csv"}</strong></span>
                {preview.unclear_count > 0 && <span className="text-amber-700">{preview.unclear_count} uncategorised</span>}
              </div>

              {preview.meta?.columns && (
                <div className="text-[11px] text-slate-400">
                  Columns used: {Object.entries(preview.meta.columns).map(([k, v]) => `${k} → "${v}"`).join(" · ")}
                </div>
              )}

              <div className="border border-slate-200 rounded-md overflow-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="sticky top-0"><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="p-2">Date</th><th className="p-2">Party</th><th className="p-2">Description</th><th className="p-2">Category</th>
                    <th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th>
                  </tr></thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2 text-slate-500 whitespace-nowrap">{r.date}</td>
                        <td className="p-2 font-medium truncate max-w-[160px]" title={r.counterparty}>{r.counterparty || "—"}</td>
                        <td className="p-2 text-slate-500 truncate max-w-[220px]" title={r.description}>{r.description}</td>
                        <td className={`p-2 text-[11px] ${r.category === "Unclear" ? "text-amber-600" : "text-slate-500"}`}>{r.category}</td>
                        <td className="p-2 text-right font-mono-tech text-red-700">{r.debit ? inr(r.debit) : ""}</td>
                        <td className="p-2 text-right font-mono-tech text-emerald-700">{r.credit ? inr(r.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200">
          <Button variant="outline" className="rounded-sm" onClick={onClose}>Cancel</Button>
          {preview && <Button variant="outline" className="rounded-sm" onClick={() => setPreview(null)}>Re-read</Button>}
          {preview && <Button onClick={doSave} disabled={busy} className="rounded-sm bg-red-600 hover:bg-red-700">
            {busy ? "Saving…" : `Save ${preview.row_count} transactions`}
          </Button>}
        </div>
      </div>
    </div>
  );
}

function Bar({ pct }) {
  const filled = Math.max(0, Math.min(10, Math.round((pct || 0) / 10)));
  return <span className="font-mono-tech text-[11px] text-slate-400">{"▓".repeat(filled)}{"░".repeat(10 - filled)}</span>;
}

function StatementReport({ id, onBack }) {
  const [a, setA] = useState(null);
  const [txns, setTxns] = useState([]);
  const [cats, setCats] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const [an, det] = await Promise.all([
        api.get(`/bank-statements/${id}/analysis`),
        api.get(`/bank-statements/${id}`),
      ]);
      setA(an.data); setTxns(det.data.transactions || []);
      setCats(Array.from(new Set((det.data.transactions || []).map(t => t.category))));
    } catch (e) { setErr(e?.response?.data?.detail || "Could not load the report"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const recat = async (t, category) => {
    try {
      const r = await api.put(`/bank-statements/${id}/transactions/${t.id}`, { category });
      setTxns(x => x.map(y => y.id === t.id ? { ...y, category } : y));
      toast.success(r.data.unclear_count ? `${r.data.unclear_count} still unclear` : "All rows categorised");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not update"); }
  };

  if (err) return <div className="pb-10"><button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ChevronLeft className="h-4 w-4" /> Back</button><div className="text-sm text-red-600">{err}</div></div>;
  if (!a) return <div className="p-4 text-slate-400 text-sm">Loading report…</div>;

  const s = a.statement || {};
  const ALL_CATS = Array.from(new Set([...cats, "Revenue/Income", "Vendor & Supplier Payments", "Salaries & Staff",
    "Rent & Utilities", "EMI & Loan Payments", "Bank Charges & Fees", "Subscriptions & Software", "Travel & Fuel",
    "Food & Entertainment", "Taxes & Statutory", "Personal Withdrawals", "Cash Withdrawals", "Transfers (self)", "Unclear"]));
  const Stat = ({ label, value, tone }) => (
    <div className="border border-slate-200 rounded-md p-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-mono-tech ${tone || "text-slate-900"}`}>{value}</div>
    </div>
  );

  return (
    <div className="pb-10">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ChevronLeft className="h-4 w-4" /> Back to statements</button>
      <h1 className="text-xl font-bold font-display mb-1">{s.account_name} — where the money went</h1>
      <div className="text-sm text-slate-500 mb-1">{s.period_from} → {s.period_to} · {s.row_count} transactions · {s.file_name}</div>
      <div className="text-[11px] text-slate-400 mb-4">
        {s.reconciled ? "Figures tally with the closing balance. Nothing below is estimated." : "⚠ This statement does not tally — treat the figures with caution."}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Money in" value={inr(a.inflow)} tone="text-emerald-700" />
        <Stat label="Money out" value={inr(a.outflow)} tone="text-red-700" />
        <Stat label="Net" value={inr(a.net)} tone={a.net < 0 ? "text-red-700" : "text-emerald-700"} />
        <Stat label="Kept (savings rate)" value={`${a.savings_rate_pct}%`} tone={a.savings_rate_pct < 0 ? "text-red-700" : "text-slate-900"} />
        <Stat label="Daily burn" value={inr(a.daily_burn)} />
        <Stat label="Runway at this rate" value={a.runway_days == null ? "—" : `${a.runway_days} days`} tone={(a.runway_days ?? 99) < 30 ? "text-amber-700" : ""} />
        <Stat label="Biggest single income" value={`${a.income_concentration_pct}%`} tone={a.income_concentration_pct > 50 ? "text-amber-700" : ""} />
        <Stat label="Next month if unchanged" value={inr(a.projected_closing_next_month)} />
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Where it went</h2>
      <div className="border border-slate-200 rounded-md overflow-hidden mb-5">
        <table className="w-full text-sm">
          <tbody>
            {a.categories.map(c => (
              <tr key={c.category} className="border-b border-slate-100 last:border-0">
                <td className="p-2 w-[34%]">{c.category}{c.category === "Unclear" && <span className="text-amber-600 text-[11px]"> — needs labelling</span>}</td>
                <td className="p-2 w-[22%]"><Bar pct={c.pct} /></td>
                <td className="p-2 text-slate-500 w-[10%]">{c.pct}%</td>
                <td className="p-2 text-right font-mono-tech">{inr(c.amount)}</td>
                <td className="p-2 text-right text-slate-400 text-[11px] w-[12%]">{c.count} txn</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Worth a look</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5 text-sm">
        <div className="border border-slate-200 rounded-md p-3 space-y-1.5">
          <div className="flex justify-between"><span className="text-slate-600">Personal spending through this account</span><strong className="font-mono-tech">{inr(a.personal_spend)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-600">EMI / loan load</span><strong className={`font-mono-tech ${a.emi_pct_of_inflow > 30 ? "text-red-700" : ""}`}>{inr(a.emi_total)} ({a.emi_pct_of_inflow}%)</strong></div>
          <div className="flex justify-between"><span className="text-slate-600">Bank charges — this month / a year</span><strong className="font-mono-tech">{inr(a.bank_charges)} / {inr(a.bank_charges_annualised)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-600">Small stuff nobody adds up ({a.leak_count})</span><strong className="font-mono-tech">{inr(a.leak_total)}</strong></div>
        </div>
        <div className="border border-slate-200 rounded-md p-3 space-y-1.5">
          <div className="flex justify-between"><span className="text-slate-600">Left within 72h of a big credit</span><strong className="font-mono-tech">{inr(a.spent_within_72h_of_credit)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-600">Spent on weekends</span><strong className="font-mono-tech">{inr(a.weekend_spend)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-600">Uncategorised</span><strong className={`font-mono-tech ${a.unclear_count ? "text-amber-700" : ""}`}>{inr(a.unclear_total)} ({a.unclear_count})</strong></div>
          <div className="flex justify-between"><span className="text-slate-600">Days below a week of outflow</span><strong className={`font-mono-tech ${a.danger_days?.length ? "text-amber-700" : ""}`}>{a.danger_days?.length || 0}</strong></div>
        </div>
      </div>

      {a.duplicates?.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-md p-3 mb-5 text-sm">
          <div className="font-medium text-amber-800 mb-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Possible duplicate payments</div>
          {a.duplicates.map((d, i) => <div key={i} className="text-amber-900 text-[12px]">{d.date} · {inr(d.amount)} · {d.description}</div>)}
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Biggest payments</h2>
      <div className="border border-slate-200 rounded-md overflow-hidden mb-5">
        <table className="w-full text-sm">
          <tbody>
            {a.top_expenses.map((t, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="p-2 text-slate-500 w-[14%]">{t.date}</td>
                <td className="p-2">{t.description}</td>
                <td className="p-2 text-slate-400 text-[11px] w-[22%]">{t.category}</td>
                <td className="p-2 text-right font-mono-tech w-[18%]">{inr(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-2">All transactions</h2>
      <p className="text-[11px] text-slate-400 mb-2">Change a category to correct it — nothing is guessed, so anything marked Unclear is waiting for you.</p>
      <div className="overflow-x-auto border border-slate-200 rounded-md">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="p-2">Date</th><th className="p-2">Party</th><th className="p-2">Description</th><th className="p-2">Ref</th>
            <th className="p-2">Category</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th><th className="p-2 text-right">Balance</th>
          </tr></thead>
          <tbody>
            {txns.map(t => (
              <tr key={t.id} className={`border-t border-slate-100 ${t.category === "Unclear" ? "bg-amber-50/40" : ""}`}>
                <td className="p-2 text-slate-500 whitespace-nowrap">{t.date}</td>
                <td className="p-2 font-medium">{t.counterparty || "—"}</td>
                <td className="p-2 text-slate-500 text-[12px]">{t.description}</td>
                <td className="p-2 text-slate-400 text-[11px]">{t.ref}</td>
                <td className="p-2">
                  <select value={t.category} onChange={e => recat(t, e.target.value)}
                          className={`text-xs border rounded-sm px-1.5 py-1 bg-white ${t.category === "Unclear" ? "border-amber-300 text-amber-700" : "border-slate-200"}`}>
                    {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="p-2 text-right font-mono-tech text-red-700">{t.debit ? inr(t.debit) : ""}</td>
                <td className="p-2 text-right font-mono-tech text-emerald-700">{t.credit ? inr(t.credit) : ""}</td>
                <td className="p-2 text-right font-mono-tech text-slate-500">{t.balance == null ? "" : inr(t.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
