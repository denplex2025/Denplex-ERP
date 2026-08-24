import { useEffect, useState, useMemo } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PageHeader, Card, Th, Td, Empty, fmtDate, inr } from "@/components/erp/Primitives";
import FYFilter from "@/components/erp/FYFilter";
import { ALL_DATA, currentFYLabel, currentFYRange } from "@/lib/fiscalYear";
import { FileText, Search, FileDown, FileSpreadsheet, FileType } from "lucide-react";
import { toast } from "sonner";

export default function PartyStatement() {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [partyId, setPartyId] = useState("");
  const [stmt, setStmt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState("");

  // Filters: Financial Year preset (defaults to current FY, same convention as every other report
  // in the ERP) OR a manual from/to range OR "All Data" for full history — mirrors Invoices.jsx /
  // PurchaseBills.jsx's filter bar so this behaves consistently with the rest of the app.
  const [fy, setFy] = useState(currentFYLabel());
  const cfy = currentFYRange();
  const [dateFrom, setDateFrom] = useState(cfy.from);
  const [dateTo, setDateTo] = useState(cfy.to);

  useEffect(() => {
    api.get("/customers").then(r => setCustomers(r.data || [])).catch(()=>{});
    api.get("/suppliers").then(r => setSuppliers(r.data || [])).catch(()=>{});
  }, []);

  const load = async (id, from = dateFrom, to = dateTo) => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await api.get(`/parties/${id}/statement/filtered`, { params: { date_from: from || "", date_to: to || "" } });
      setStmt(r.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to load statement"); }
    finally { setLoading(false); }
  };

  const onFYChange = (v) => {
    setFy(v.value);
    const from = v.value === ALL_DATA ? "" : v.from;
    const to = v.value === ALL_DATA ? "" : v.to;
    setDateFrom(from); setDateTo(to);
    if (partyId) load(partyId, from, to);
  };

  const applyManualRange = () => { if (partyId) load(partyId, dateFrom, dateTo); };

  const download = async (kind) => {
    if (!partyId) return;
    setExporting(kind);
    try {
      const r = await api.get(`/parties/${partyId}/statement/${kind}`, {
        params: { date_from: dateFrom || "", date_to: dateTo || "" },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a");
      const ext = kind === "xlsx" ? "xlsx" : kind;
      a.href = url; a.download = `Statement-${stmt?.party?.name || partyId}.${ext}`; a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { toast.error(`${kind.toUpperCase()} download failed`); }
    finally { setExporting(""); }
  };

  const parties = useMemo(() => {
    const map = new Map();
    customers.forEach(c => map.set(c.id, { ...c, kind: "Customer" }));
    suppliers.forEach(s => map.set(s.id, { ...s, kind: "Supplier" }));
    return [...map.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [customers, suppliers]);

  return (
    <div data-testid="party-statement-page">
      <PageHeader
        overline="Accounting"
        title="Account Statement"
        subtitle="Per-party ledger with running balance. Combines sales, payments, returns from the party."
      />

      <Card className="p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="text-xs uppercase tracking-wider text-slate-600 font-semibold">Select Party</label>
            <Select value={partyId} onValueChange={v => { setPartyId(v); load(v); }}>
              <SelectTrigger className="rounded-sm mt-1.5"><SelectValue placeholder="Choose a customer or supplier…" /></SelectTrigger>
              <SelectContent>
                {parties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} <span className="text-xs text-slate-500 ml-1">· {p.kind}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wider text-slate-600 font-semibold">Financial Year</label>
            <FYFilter value={fy} onChange={onFYChange} className="mt-1.5 w-full h-9" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wider text-slate-600 font-semibold">From</label>
            <Input type="date" value={dateFrom || ""} onChange={e => setDateFrom(e.target.value)} className="mt-1.5" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wider text-slate-600 font-semibold">To</label>
            <Input type="date" value={dateTo || ""} onChange={e => setDateTo(e.target.value)} className="mt-1.5" />
          </div>
          <div className="md:col-span-2">
            <Button onClick={applyManualRange} variant="outline" className="rounded-sm w-full" disabled={!partyId}>
              <Search className="h-4 w-4 mr-1" /> Apply
            </Button>
          </div>
        </div>
      </Card>

      {loading ? <Card className="p-6 text-slate-500 text-sm">Loading…</Card> :
       !stmt ? <Card className="p-6"><Empty label="Select a party to view their statement." /></Card> :
       (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Party</div>
              <div className="font-display text-lg font-semibold mt-1">{stmt.party?.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 font-mono-tech">{stmt.party?.gstin || "—"}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Opening Balance</div>
              <div className="font-display text-2xl font-bold mt-1">{inr(stmt.opening_balance || 0)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Closing Balance</div>
              <div className={`font-display text-2xl font-bold mt-1 ${stmt.closing_balance > 0 ? "text-red-700" : stmt.closing_balance < 0 ? "text-emerald-700" : "text-slate-900"}`}>
                {inr(Math.abs(stmt.closing_balance || 0))} {stmt.closing_balance > 0 ? "Dr" : stmt.closing_balance < 0 ? "Cr" : ""}
              </div>
            </Card>
          </div>

          <Card>
            <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <div className="font-display font-semibold">Transactions</div>
              <div className="text-xs text-slate-500 ml-2">{stmt.transactions?.length || 0} entries</div>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="outline" className="rounded-sm" disabled={!!exporting} onClick={() => download("pdf")}>
                  <FileType className="h-3.5 w-3.5 mr-1" /> {exporting === "pdf" ? "…" : "PDF"}
                </Button>
                <Button size="sm" variant="outline" className="rounded-sm" disabled={!!exporting} onClick={() => download("xlsx")}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> {exporting === "xlsx" ? "…" : "Excel"}
                </Button>
                <Button size="sm" variant="outline" className="rounded-sm" disabled={!!exporting} onClick={() => download("csv")}>
                  <FileDown className="h-3.5 w-3.5 mr-1" /> {exporting === "csv" ? "…" : "CSV"}
                </Button>
              </div>
            </div>
            {!stmt.transactions?.length ? <Empty label="No transactions in this range." /> : (
              <table className="w-full">
                <thead><tr><Th>#</Th><Th>Date</Th><Th>Type</Th><Th>Reference</Th><Th className="text-right">Debit</Th><Th className="text-right">Credit</Th><Th className="text-right">Running</Th></tr></thead>
                <tbody>
                  {stmt.transactions.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <Td>{i + 1}</Td>
                      <Td>{fmtDate(t.date)}</Td>
                      <Td>{t.type}</Td>
                      <Td className="font-mono-tech text-xs">{t.ref || "—"}</Td>
                      <Td className="text-right font-medium">{t.debit ? inr(t.debit) : ""}</Td>
                      <Td className="text-right font-medium text-emerald-700">{t.credit ? inr(t.credit) : ""}</Td>
                      <Td className="text-right font-medium">{inr(t.running)} {t.running > 0 ? "Dr" : t.running < 0 ? "Cr" : ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
       )}
    </div>
  );
}
