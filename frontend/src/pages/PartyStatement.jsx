import { useEffect, useState, useMemo } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PageHeader, Card, Th, Td, Empty, fmtDate, inr } from "@/components/erp/Primitives";
import { FileText, Search } from "lucide-react";
import { toast } from "sonner";

export default function PartyStatement() {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [partyId, setPartyId] = useState("");
  const [stmt, setStmt] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/customers").then(r => setCustomers(r.data || [])).catch(()=>{});
    api.get("/suppliers").then(r => setSuppliers(r.data || [])).catch(()=>{});
  }, []);

  const load = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await api.get(`/parties/${id}/statement`);
      setStmt(r.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to load statement"); }
    finally { setLoading(false); }
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
        subtitle="Per-party ledger with running balance. Vyapar-style — combines sales, payments, returns."
      />

      <Card className="p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
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
          <Button onClick={() => load(partyId)} variant="outline" className="rounded-sm" disabled={!partyId}>
            <Search className="h-4 w-4 mr-1" /> Refresh
          </Button>
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
              <div className="text-xs text-slate-500 ml-auto">{stmt.transactions?.length || 0} entries</div>
            </div>
            {!stmt.transactions?.length ? <Empty label="No transactions yet." /> : (
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
