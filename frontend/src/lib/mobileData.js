// Shared data helpers for the mobile (Koshix) screens. Composes several existing list +
// settled-summary endpoints client-side rather than requiring new backend aggregate routes —
// keeps the mobile UI v1 self-contained. If these screens get slow on large datasets, the fix
// is a dedicated /dashboard/mobile-summary endpoint that does this math server-side instead.
import api from "@/lib/api";

export const asArr = (v) => (Array.isArray(v) ? v : []);
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

export function inr(n) {
  const v = Number(n) || 0;
  return "₹" + Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Loads customers/suppliers + invoices/vendor-bills + their settled-summary maps once,
 * and derives everything the Home + Dashboard mobile screens need from that single fetch. */
export async function loadMobileFinancials() {
  const [customers, suppliers, invoices, invSettled, bills, billSettled, paymentsIn, paymentsOut, items, expenses, cheques] =
    await Promise.all([
      api.get("/customers", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
      api.get("/suppliers", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
      api.get("/invoices", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
      api.get("/invoices/settled-summary", { silent: true }).then((r) => r.data || {}).catch(() => ({})),
      api.get("/vendor-bills", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
      api.get("/vendor-bills/settled-summary", { silent: true }).then((r) => r.data || {}).catch(() => ({})),
      api.get("/payments-in", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
      api.get("/payments-out", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
      api.get("/inventory/items", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
      api.get("/expenses", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
      api.get("/cheques", { silent: true }).then((r) => asArr(r.data)).catch(() => []),
    ]);

  // Balance per customer (You'll Get) / per supplier (You'll Give)
  const recvByCustomer = {};
  for (const inv of invoices) {
    const bal = Number(inv.total || 0) - Number(invSettled[inv.id] || 0);
    recvByCustomer[inv.customer_id] = (recvByCustomer[inv.customer_id] || 0) + bal;
  }
  const payBySupplier = {};
  for (const b of bills) {
    const bal = Number(b.total || 0) - Number(billSettled[b.id] || 0);
    payBySupplier[b.supplier_id] = (payBySupplier[b.supplier_id] || 0) + bal;
  }

  const parties = [
    ...customers.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, type: "customer",
      balance: round2(recvByCustomer[c.id] || 0), // positive = You'll Get
    })),
    ...suppliers.map((s) => ({
      id: s.id, name: s.name, phone: s.phone, type: "supplier",
      balance: -round2(payBySupplier[s.id] || 0), // negative = You'll Give
    })),
  ];

  const receivableTotal = round2(sum(Object.values(recvByCustomer)));
  const payableTotal = round2(sum(Object.values(payBySupplier)));

  // Unified transaction feed (Home > Transaction Details tab)
  const transactions = [
    ...invoices.map((i) => ({
      id: i.id, kind: "Sale", statusLabel: i.status === "paid" ? "PAID" : "UNPAID",
      party: i.customer_name, code: i.code, date: i.date, dueDate: i.due_date,
      total: Number(i.total || 0), balance: round2(Number(i.total || 0) - Number(invSettled[i.id] || 0)),
      color: i.status === "paid" ? "emerald" : "amber",
    })),
    ...bills.map((b) => ({
      id: b.id, kind: "Purchase", statusLabel: b.status === "paid" ? "PAID" : "UNPAID",
      party: b.supplier_name, code: b.code, date: b.date, dueDate: b.due_date,
      total: Number(b.total || 0), balance: round2(Number(b.total || 0) - Number(billSettled[b.id] || 0)),
      color: b.status === "paid" ? "emerald" : "amber",
    })),
    ...paymentsIn.map((p) => ({
      id: p.id, kind: "Payment In", statusLabel: (p.status || "").toUpperCase() || "RECEIVED",
      party: p.party_name, code: p.code, date: p.date, dueDate: "",
      total: Number(p.amount || 0), balance: 0, color: "emerald",
    })),
    ...paymentsOut.map((p) => ({
      id: p.id, kind: "Payment Out", statusLabel: (p.status || "").toUpperCase() || "PAID",
      party: p.party_name, code: p.code, date: p.date, dueDate: "",
      total: Number(p.amount || 0), balance: 0, color: "slate",
    })),
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  // Stock value + low stock
  const stockValue = round2(sum(items.map((it) => (Number(it.unit_cost || it.purchase_price || 0)) * Number(it.qty_on_hand || 0))));
  const lowStock = items.filter((it) => Number(it.reorder_level || 0) > 0 && Number(it.qty_on_hand || 0) <= Number(it.reorder_level || 0))
    .map((it) => ({ name: it.name, shortfall: round2(Number(it.qty_on_hand || 0) - Number(it.reorder_level || 0)) }))
    .sort((a, b) => a.shortfall - b.shortfall);

  // Open sale / purchase transactions — map in the computed balance, since the raw invoice/bill
  // objects only carry `total`, not a settled-adjusted `balance` field.
  const openInvoices = invoices
    .map((i) => ({ ...i, balance: round2(Number(i.total || 0) - Number(invSettled[i.id] || 0)) }))
    .filter((i) => i.balance > 0.01);
  const openBills = bills
    .map((b) => ({ ...b, balance: round2(Number(b.total || 0) - Number(billSettled[b.id] || 0)) }))
    .filter((b) => b.balance > 0.01);

  // Cheques
  const receivedCheques = cheques.filter((c) => c.direction === "in" && c.cheque_status === "Pending");
  const paidCheques = cheques.filter((c) => c.direction === "out" && c.cheque_status === "Pending");

  // Month-to-date sales / purchases / expenses
  const ym = new Date().toISOString().slice(0, 7);
  const monthSales = round2(sum(invoices.filter((i) => String(i.date || "").slice(0, 7) === ym).map((i) => i.total)));
  const monthPurchases = round2(sum(bills.filter((b) => String(b.date || "").slice(0, 7) === ym).map((b) => b.total)));
  const monthExpenses = round2(sum(expenses.filter((e) => String(e.date || "").slice(0, 7) === ym).map((e) => e.amount)));

  // Last 6 months sales trend (for the small area chart)
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString("en-IN", { month: "short" });
    trend.push({ month: label, amount: round2(sum(invoices.filter((inv) => String(inv.date || "").slice(0, 7) === key).map((inv) => inv.total))) });
  }

  // Expense breakdown by category (top 5)
  const byCat = {};
  for (const e of expenses) {
    const key = e.category_name || "Other";
    byCat[key] = (byCat[key] || 0) + Number(e.amount || 0);
  }
  const expenseBreakdown = Object.entries(byCat).map(([name, amount]) => ({ name, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount).slice(0, 5);

  return {
    parties, transactions, receivableTotal, payableTotal,
    items, stockValue, lowStock,
    openInvoices, openBills, receivedCheques, paidCheques,
    monthSales, monthPurchases, monthExpenses, trend, expenseBreakdown,
  };
}
