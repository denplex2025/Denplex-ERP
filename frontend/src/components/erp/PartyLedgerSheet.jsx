import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Th, Td, Empty, inr, fmtDate } from "@/components/erp/Primitives";
import { StatusBadge } from "@/components/erp/CrudPage";
import { BookUser } from "lucide-react";
import { toast } from "sonner";

/** Per-row "View Ledger" trigger button for Customers/Suppliers CrudPage rowActions. */
export function ViewLedgerButton({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="rounded-sm h-8 w-8"
        title="View Ledger"
        data-testid={`row-ledger-${row.id}`}
        onClick={() => setOpen(true)}
      >
        <BookUser className="h-4 w-4 text-slate-600" />
      </Button>
      {open && <PartyLedgerSheet pid={row.id} open={open} onOpenChange={setOpen} />}
    </>
  );
}

/** Two-pane style party detail: header summary + full transaction history table. */
export function PartyLedgerSheet({ pid, open, onOpenChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !pid) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/parties/${pid}/transactions`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) toast.error("Failed to load party ledger"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, pid]);

  const party = data?.party;
  const txns = data?.transactions || [];
  const totalOutstanding = txns.reduce((s, t) => {
    const sign = t.type.startsWith("Payment") || t.type.includes("Return") ? -1 : 1;
    return s + sign * (t.balance || 0);
  }, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none w-full sm:max-w-3xl overflow-y-auto" data-testid="party-ledger-sheet">
        <SheetHeader>
          <SheetTitle className="font-display tracking-tight">
            {party?.name || "Party Details"}
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
        ) : !data ? (
          <Empty label="Could not load party details." />
        ) : (
          <div className="mt-4 space-y-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 border border-slate-200 rounded-sm p-4">
              <div><span className="text-slate-500">GSTIN:</span> {party.gstin || "—"}</div>
              <div><span className="text-slate-500">Phone:</span> {party.phone || "—"}</div>
              <div><span className="text-slate-500">Contact:</span> {party.contact_person || "—"}</div>
              <div><span className="text-slate-500">Email:</span> {party.email || "—"}</div>
              <div className="col-span-2"><span className="text-slate-500">Address:</span> {party.address || "—"}</div>
              <div className="col-span-2 pt-2 border-t border-slate-200 mt-1">
                <span className="text-slate-500">Net Outstanding:</span>{" "}
                <span className={`font-display font-bold ${totalOutstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {inr(Math.abs(totalOutstanding))} {totalOutstanding > 0 ? "receivable" : totalOutstanding < 0 ? "advance/credit" : ""}
                </span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Transaction History ({txns.length})
              </div>
              {txns.length === 0 ? (
                <Empty label="No transactions yet." />
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-sm">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>Type</Th>
                        <Th>Number</Th>
                        <Th>Date</Th>
                        <Th className="text-right">Total</Th>
                        <Th className="text-right">Balance</Th>
                        <Th>Due Date</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <Td>{t.type}</Td>
                          <Td className="font-mono-tech text-xs">{t.number || "—"}</Td>
                          <Td>{fmtDate(t.date)}</Td>
                          <Td className="text-right">{inr(t.total)}</Td>
                          <Td className="text-right">{t.balance ? inr(t.balance) : "—"}</Td>
                          <Td>{fmtDate(t.due_date)}</Td>
                          <Td>{t.status ? <StatusBadge status={t.status} /> : "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
