import { Link } from "react-router-dom";
import { ArrowRight, Cog, Layers, ShieldCheck, Boxes, BarChart3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const HERO_IMG = "https://static.prod-images.emergentagent.com/jobs/7f514505-bc8d-48ed-954b-5815c5f6170a/images/0475821f5ac9696210216b4d7b8fd14a0f3b01c44be9da7e3b33a4e81d154066.png";
const FEAT_IMG = "https://images.unsplash.com/photo-1666634157070-6fd830fb5672?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwxfHxwcmVjaXNpb24lMjBjbmMlMjBtYWNoaW5pbmclMjBtZXRhbHxlbnwwfHx8fDE3NzkxMjY0NDR8MA&ixlib=rb-4.1.0&q=85";

const Landing = () => {
  return (
    <div className="min-h-screen bg-white text-slate-900" data-testid="landing-page">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="brand-link">
            <div className="h-7 w-7 bg-slate-900 flex items-center justify-center">
              <Cog className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold tracking-tight text-lg">PRECISION ERP</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#modules" className="hover:text-slate-900">Modules</a>
            <Link to="/portal" className="hover:text-slate-900" data-testid="nav-portal-link">Customer Portal</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" className="rounded-sm" data-testid="nav-login-button">Sign in</Button>
            </Link>
            <Link to="/login">
              <Button className="rounded-sm bg-blue-700 hover:bg-blue-800" data-testid="nav-cta-button">
                Open dashboard <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 py-16 lg:py-24 items-center">
          <div className="lg:col-span-7 fade-up">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 mb-4">
              Manufacturing ERP · Jig & Fixtures · Precision Job Work
            </div>
            <h1 className="font-display font-bold tracking-tight text-4xl sm:text-5xl lg:text-6xl text-slate-900">
              Run your workshop with<br />the precision of a<span className="text-blue-700"> ±0.001 mm </span>cut.
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">
              One operating system for your inventory, BOM, work orders, job cards, QC, quotations, GST invoices, leads, and customer portal — built for small-scale precision engineering businesses.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login">
                <Button className="rounded-sm h-11 px-6 bg-blue-700 hover:bg-blue-800" data-testid="hero-primary-cta">
                  Sign in to dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/portal">
                <Button variant="outline" className="rounded-sm h-11 px-6 border-slate-300" data-testid="hero-portal-cta">
                  Track an order
                </Button>
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-3 max-w-md gap-6 border-t border-slate-200 pt-6">
              <Stat k="16+" v="Modules" />
              <Stat k="ISO" v="9001 ready" />
              <Stat k="GST" v="CGST/SGST/IGST" />
            </div>
          </div>
          <div className="lg:col-span-5 relative">
            <div className="relative aspect-[4/5] overflow-hidden border border-slate-200">
              <img src={HERO_IMG} alt="precision jig" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/30 via-transparent to-blue-700/20" />
              <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur p-4 border border-slate-200">
                <div className="text-[10px] font-mono-tech uppercase tracking-widest text-slate-500">Live · Workshop floor</div>
                <div className="mt-1 font-display font-semibold text-slate-900">Open WO #WO-26-0042</div>
                <div className="text-xs text-slate-600 mt-0.5">SS-316 Drill Jig · Qty 24 · Stage: Milling</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Capabilities</div>
          <h2 className="font-display text-3xl lg:text-4xl font-bold mt-2 tracking-tight">Engineered for the shop floor.</h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
            <Feature icon={<Boxes className="h-5 w-5" />} title="Inventory & AI bill scan" desc="Stock in/out, in-process tracking, adjustments. Scan a paper or digital bill and Claude reads it into your system." />
            <Feature icon={<Layers className="h-5 w-5" />} title="Work Orders & Job Cards" desc="Plan production, assign machines and operators, track progress in real time." />
            <Feature icon={<ShieldCheck className="h-5 w-5" />} title="QC reports with photos" desc="Capture parameters, measurements, pass/fail. Link to work orders & customers forever." />
            <Feature icon={<BarChart3 className="h-5 w-5" />} title="GST invoices & quotations" desc="CGST / SGST / IGST automatically. Quotations, POs, invoices in one place." />
            <Feature icon={<Users className="h-5 w-5" />} title="CRM + WhatsApp" desc="Leads, repeat vs one-time customers, click-to-WhatsApp to send POs, quotes, and follow-ups." />
            <Feature icon={<Cog className="h-5 w-5" />} title="Customer portal" desc="Customers track their order with a PO or reference number. Public, branded, mobile-friendly." />
          </div>
        </div>
      </section>

      {/* Modules strip */}
      <section id="modules" className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <div className="aspect-[4/3] overflow-hidden border border-slate-200">
              <img src={FEAT_IMG} alt="CNC" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="lg:col-span-7">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Built-in modules</div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mt-2 tracking-tight">Everything your workshop needs — nothing it doesn't.</h2>
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
              {["Inventory","BOM","Work Orders","Job Cards","Quotations","Purchase Orders","Invoices","QC Reports","CRM / Leads","Suppliers","Customers","Documents","Dashboard","Customer Portal","User Roles","GST"].map(m => (
                <div key={m} className="bg-white p-4">
                  <div className="font-mono-tech text-[10px] text-slate-400 uppercase">Module</div>
                  <div className="font-display font-semibold text-slate-900 mt-0.5">{m}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h3 className="font-display text-3xl font-bold tracking-tight">Ready to run a tighter shop?</h3>
            <p className="text-slate-300 mt-2">Sign in with the seeded admin to explore the entire system.</p>
            <p className="text-xs text-slate-400 mt-1 font-mono-tech">admin@erp.com · Admin@123</p>
          </div>
          <Link to="/login">
            <Button className="rounded-sm h-12 px-7 bg-white text-slate-900 hover:bg-slate-100" data-testid="footer-cta-button">
              Sign in <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-slate-500 flex justify-between">
          <div>© 2026 Precision ERP</div>
          <div className="font-mono-tech">v0.1 · Built for MSMEs</div>
        </div>
      </footer>
    </div>
  );
};

const Stat = ({ k, v }) => (
  <div>
    <div className="font-display text-2xl font-bold text-slate-900">{k}</div>
    <div className="text-xs uppercase tracking-widest text-slate-500 mt-0.5">{v}</div>
  </div>
);

const Feature = ({ icon, title, desc }) => (
  <div className="bg-white p-6">
    <div className="h-9 w-9 bg-blue-700 text-white flex items-center justify-center">{icon}</div>
    <div className="mt-4 font-display font-semibold text-lg text-slate-900">{title}</div>
    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{desc}</p>
  </div>
);

export default Landing;
