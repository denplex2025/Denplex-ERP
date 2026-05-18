import { useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Trial() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/trial/request", form);
      setDone(true);
      toast.success("Trial request received");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to submit");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="trial-page">
      <header className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/denplex-logo.png" alt="Denplex" className="h-9 w-9 object-contain" />
            <span className="font-display font-bold tracking-tight">DENPLEX ERP</span>
          </Link>
          <Link to="/" className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </div>
      </header>
      <div className="brand-stripe" />

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Request access</div>
        <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tight mt-2 text-slate-900">
          Try Denplex ERP free<br />for <span className="text-red-600">30 days</span>.
        </h1>
        <p className="text-slate-600 mt-4 leading-relaxed">
          Tell us a bit about your workshop. We verify each request manually within 24 hours and email you login credentials. Trial accounts get <strong>full read access + create permissions</strong> on every module (inventory, work orders, quotations, leads, customer portal…). Edits and deletions are reserved for paid licenses.
        </p>

        {done ? (
          <div className="mt-10 border border-emerald-200 bg-emerald-50 p-8 fade-up">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <h2 className="font-display text-2xl font-bold mt-4 text-slate-900">Thank you — request received.</h2>
            <p className="text-slate-700 mt-2 text-sm">We'll verify your business details and email you a temporary password within 24 hours. Please add <code className="bg-white px-1 font-mono-tech">admin@denplex.co</code> to your contacts so our mail doesn't get filtered.</p>
            <Link to="/" className="mt-4 inline-block text-red-600 underline text-sm">← Back to home</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="trial-form">
            <Fld label="Your name *"><Input value={form.name||""} onChange={e=>setF("name", e.target.value)} required className="rounded-sm" data-testid="trial-name" /></Fld>
            <Fld label="Company name *"><Input value={form.company||""} onChange={e=>setF("company", e.target.value)} required className="rounded-sm" data-testid="trial-company" /></Fld>
            <Fld label="Email *"><Input type="email" value={form.email||""} onChange={e=>setF("email", e.target.value)} required className="rounded-sm" data-testid="trial-email" /></Fld>
            <Fld label="Phone (with country code) *"><Input value={form.phone||""} onChange={e=>setF("phone", e.target.value)} required placeholder="+91 98765 43210" className="rounded-sm" data-testid="trial-phone" /></Fld>
            <Fld label="GSTIN (optional — speeds up verification)"><Input value={form.gstin||""} onChange={e=>setF("gstin", e.target.value)} className="rounded-sm font-mono-tech" /></Fld>
            <Fld label="Business type"><Input value={form.business_type||""} onChange={e=>setF("business_type", e.target.value)} placeholder="e.g. Jig & Fixtures, CNC machining" className="rounded-sm" /></Fld>
            <div className="md:col-span-2"><Fld label="What would you like to evaluate?"><Textarea rows={3} value={form.purpose||""} onChange={e=>setF("purpose", e.target.value)} placeholder="e.g. Replace our Excel-based work-order system; integrate Indiamart leads; explore the customer portal." className="rounded-sm" /></Fld></div>
            <div className="md:col-span-2 mt-2">
              <Button type="submit" disabled={loading} className="rounded-sm bg-red-600 hover:bg-red-700 h-11 px-6" data-testid="trial-submit">
                {loading ? "Submitting..." : "Request 30-day trial"}
              </Button>
              <p className="text-xs text-slate-500 mt-3">By submitting, you agree to receive a one-time verification email from admin@denplex.co. Your data is never shared.</p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const Fld = ({ label, children }) => (
  <div><Label className="text-xs uppercase tracking-wider text-slate-600">{label}</Label><div className="mt-1.5">{children}</div></div>
);
