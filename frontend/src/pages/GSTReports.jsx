import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Download, Landmark } from "lucide-react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fyDefault() {
  const t = new Date();
  const y = t.getMonth() + 1 >= 4 ? t.getFullYear() : t.getFullYear() - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

const TABS = [
  { k: "gstr1", label: "GSTR-1 (Outward)" },
  { k: "gstr3b", label: "GSTR-3B (Summary)" },
  { k: "gstr2", label: "GSTR-2 (Purchases)" },
];

export default function GSTReports() {
  const [range, setRange] = useState(fyDefault());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("gstr1");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/reports/gst/summary", { params: { date_from: range.from, date_to: range.to } });
      setData(r.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not load GST report"); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const download = async () => {
    try {
      const r = await api.get("/reports/gst/export.xlsx", { params: { date_from: range.from, date_to: range.to }, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a"); a.href = url; a.download = `GST_Report_${range.from}_to_${range.to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Download failed"); }
  };

  const setMonth = (ym) => { if (ym) { const [y, m] = ym.split("-"); const last = new Date(y, m, 0).getDate(); setRange({ from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` }); } };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-1">
        <Landmark className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">GST Reports</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">GSTR-1, GSTR-3B and purchase (GSTR-2) summaries computed from your invoices and bills. Download as Excel for filing or your CA.</p>

      <div className="flex flex-wrap items-end gap-3 mb-4 bg-slate-50 border border-slate-200 rounded-md p-3">
        <div><Label className="text-[11px] uppercase tracking-wider text-slate-500">From</Label><Input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="mt-1 w-40" /></div>
        <div><Label className="text-[11px] uppercase tracking-wider text-slate-500">To</Label><Input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="mt-1 w-40" /></div>
        <div><Label className="text-[11px] uppercase tracking-wider text-slate-500">Quick month</Label><Input type="month" onChange={e => setMonth(e.target.value)} className="mt-1 w-40" /></div>
        <Button onClick={load} disabled={loading} className="rounded-sm bg-red-600 hover:bg-red-700">{loading ? "Loading…" : "Run"}</Button>
        <Button onClick={download} variant="outline" className="rounded-sm ml-auto"><Download className="h-4 w-4 mr-1" /> Excel</Button>
      </div>

      {data && (
        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
          <span>{data.counts?.invoices ?? 0} invoices · {data.counts?.bills ?? 0} bills</span>
          <span className="text-slate-300">|</span>
          <span>{data.range?.from} → {data.range?.to}</span>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${tab === t.k ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!data && <div className="text-slate-400 text-sm p-6">Pick a range and click Run.</div>}
      {data && tab === "gstr1" && <Gstr1 g={data.gstr1} />}
      {data && tab === "gstr3b" && <Gstr3b b={data.gstr3b} />}
      {data && tab === "gstr2" && <Gstr2 rows={data.gstr2} />}
    </div>
  );
}

function Money({ v }) { return <span className="font-mono-tech whitespace-nowrap">{inr(v)}</span>; }

function Table({ cols, rows, render, empty }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-md mb-6">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
          {cols.map((c, i) => <th key={i} className={`p-2 ${c.r ? "text-right" : ""}`}>{c.h}</th>)}
        </tr></thead>
        <tbody>
          {(!rows || rows.length === 0) && <tr><td colSpan={cols.length} className="p-6 text-center text-slate-400">{empty || "No records."}</td></tr>}
          {rows && rows.map((row, i) => <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60">{render(row)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Gstr1({ g }) {
  const sum = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
  return (
    <>
      <h3 className="font-semibold text-slate-700 mb-2">B2B (registered parties) — {g.b2b.length}</h3>
      <Table cols={[{ h: "Invoice" }, { h: "Date" }, { h: "Party" }, { h: "GSTIN" }, { h: "POS" }, { h: "Taxable", r: 1 }, { h: "CGST", r: 1 }, { h: "SGST", r: 1 }, { h: "IGST", r: 1 }, { h: "Total", r: 1 }]}
        rows={g.b2b} empty="No B2B invoices."
        render={(r) => (<>
          <td className="p-2 font-medium">{r.invoice_no}</td><td className="p-2 text-slate-500">{r.date}</td>
          <td className="p-2">{r.party}</td><td className="p-2 text-slate-500">{r.gstin}</td><td className="p-2 text-slate-500">{r.place_of_supply}</td>
          <td className="p-2 text-right"><Money v={r.taxable} /></td><td className="p-2 text-right"><Money v={r.cgst} /></td>
          <td className="p-2 text-right"><Money v={r.sgst} /></td><td className="p-2 text-right"><Money v={r.igst} /></td>
          <td className="p-2 text-right font-medium"><Money v={r.total} /></td>
        </>)} />
      <h3 className="font-semibold text-slate-700 mb-2">B2C (unregistered) — by rate</h3>
      <Table cols={[{ h: "Rate%" }, { h: "POS" }, { h: "Invoices", r: 1 }, { h: "Taxable", r: 1 }, { h: "CGST", r: 1 }, { h: "SGST", r: 1 }, { h: "IGST", r: 1 }, { h: "Total", r: 1 }]}
        rows={g.b2c} empty="No B2C invoices."
        render={(r) => (<>
          <td className="p-2">{r.rate}%</td><td className="p-2 text-slate-500">{r.place_of_supply}</td><td className="p-2 text-right">{r.count}</td>
          <td className="p-2 text-right"><Money v={r.taxable} /></td><td className="p-2 text-right"><Money v={r.cgst} /></td>
          <td className="p-2 text-right"><Money v={r.sgst} /></td><td className="p-2 text-right"><Money v={r.igst} /></td>
          <td className="p-2 text-right font-medium"><Money v={r.total} /></td>
        </>)} />
      <h3 className="font-semibold text-slate-700 mb-2">HSN / SAC summary</h3>
      <Table cols={[{ h: "HSN/SAC" }, { h: "Rate%" }, { h: "Qty", r: 1 }, { h: "Taxable", r: 1 }, { h: "CGST", r: 1 }, { h: "SGST", r: 1 }, { h: "IGST", r: 1 }]}
        rows={g.hsn} empty="No line items."
        render={(r) => (<>
          <td className="p-2 font-medium">{r.hsn || "—"}</td><td className="p-2">{r.rate}%</td><td className="p-2 text-right">{r.qty}</td>
          <td className="p-2 text-right"><Money v={r.taxable} /></td><td className="p-2 text-right"><Money v={r.cgst} /></td>
          <td className="p-2 text-right"><Money v={r.sgst} /></td><td className="p-2 text-right"><Money v={r.igst} /></td>
        </>)} />
    </>
  );
}

function Gstr3b({ b }) {
  const Row = ({ label, t, c, s, i, strong }) => (
    <tr className={`border-t border-slate-100 ${strong ? "font-bold bg-slate-50" : ""}`}>
      <td className="p-2">{label}</td>
      <td className="p-2 text-right">{t === "" ? "" : <Money v={t} />}</td>
      <td className="p-2 text-right">{c === "" ? "" : <Money v={c} />}</td>
      <td className="p-2 text-right">{s === "" ? "" : <Money v={s} />}</td>
      <td className="p-2 text-right">{i === "" ? "" : <Money v={i} />}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-md max-w-3xl">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
          <th className="p-2">Section</th><th className="p-2 text-right">Taxable</th><th className="p-2 text-right">CGST</th><th className="p-2 text-right">SGST</th><th className="p-2 text-right">IGST</th>
        </tr></thead>
        <tbody>
          <Row label="3.1(a) Outward taxable" t={b.outward.taxable} c={b.outward.cgst} s={b.outward.sgst} i={b.outward.igst} />
          <Row label="3.1(b) Zero-rated / Export" t={b.export_value} c={0} s={0} i={0} />
          <Row label="3.1(e) Nil / Non-GST" t={b.nongst_value} c={0} s={0} i={0} />
          <Row label="4(A) Inward ITC (purchases)" t={b.inward_itc.taxable} c={b.inward_itc.cgst} s={b.inward_itc.sgst} i={b.inward_itc.igst} />
          <Row label="Output Tax" t="" c="" s="" i={b.output_tax} />
          <Row label="Input Tax Credit" t="" c="" s="" i={b.input_tax_credit} />
          <Row label="NET TAX PAYABLE" t="" c="" s="" i={b.net_payable} strong />
        </tbody>
      </table>
    </div>
  );
}

function Gstr2({ rows }) {
  return (
    <Table cols={[{ h: "Bill No" }, { h: "Date" }, { h: "Supplier" }, { h: "GSTIN" }, { h: "Taxable", r: 1 }, { h: "CGST", r: 1 }, { h: "SGST", r: 1 }, { h: "IGST", r: 1 }, { h: "Total", r: 1 }]}
      rows={rows} empty="No purchase bills."
      render={(r) => (<>
        <td className="p-2 font-medium">{r.bill_no}</td><td className="p-2 text-slate-500">{r.date}</td>
        <td className="p-2">{r.party}</td><td className="p-2 text-slate-500">{r.gstin}</td>
        <td className="p-2 text-right"><Money v={r.taxable} /></td><td className="p-2 text-right"><Money v={r.cgst} /></td>
        <td className="p-2 text-right"><Money v={r.sgst} /></td><td className="p-2 text-right"><Money v={r.igst} /></td>
        <td className="p-2 text-right font-medium"><Money v={r.total} /></td>
      </>)} />
  );
}
