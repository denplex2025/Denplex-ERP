import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Cog, Layers, ShieldCheck, Boxes, BarChart3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

const ICONS = { Cog, Layers, ShieldCheck, Boxes, BarChart3, Users };

// Matches backend DEFAULT_SITE_CONFIG exactly — used until /public/site-config responds,
// so the page never flashes empty/broken content (e.g. cold start, offline backend).
const DEFAULTS = {
  brand_name: "DENPLEX ERP",
  logo_url: "/denplex-logo.png",
  overline: "Denplex Engineering Company · Jig & Fixtures · Precision Job Work",
  heading_prefix: "Run your workshop with",
  heading_highlight: "±0.001 mm",
  heading_suffix: "cut.",
  subheading: "One operating system for your inventory, BOM, work orders, job cards, QC, quotations, GST invoices, leads, and customer portal — built for small-scale precision engineering businesses.",
  hero_image: "https://static.prod-images.emergentagent.com/jobs/7f514505-bc8d-48ed-954b-5815c5f6170a/images/0475821f5ac9696210216b4d7b8fd14a0f3b01c44be9da7e3b33a4e81d154066.png",
  feature_image: "https://images.unsplash.com/photo-1666634157070-6fd830fb5672?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwxfHxwcmVjaXNpb24lMjBjbmMlMjBtYWNoaW5pbmclMjBtZXRhbHxlbnwwfHx8fDE3NzkxMjY0NDR8MA&ixlib=rb-4.1.0&q=85",
  hero_badge_line1: "Live · Workshop floor",
  hero_badge_line2: "Open WO #WO-26-0042",
  hero_badge_line3: "SS-316 Drill Jig · Qty 24 · Stage: Milling",
  stats: [{ k: "16+", v: "Modules" }, { k: "ISO", v: "9001 ready" }, { k: "GST", v: "CGST/SGST/IGST" }],
  features: [
    { icon: "Boxes", title: "Inventory & AI bill scan", desc: "Stock in/out, in-process tracking, adjustments. Scan a paper or digital bill and Claude reads it into your system." },
    { icon: "Layers", title: "Work Orders & Job Cards", desc: "Plan production, assign machines and operators, track progress in real time." },
    { icon: "ShieldCheck", title: "QC reports with photos", desc: "Capture parameters, measurements, pass/fail. Link to work orders & customers forever." },
    { icon: "BarChart3", title: "GST invoices & quotations", desc: "CGST / SGST / IGST automatically. Quotations, POs, invoices in one place." },
    { icon: "Users", title: "CRM + WhatsApp", desc: "Leads, repeat vs one-time customers, click-to-WhatsApp to send POs, quotes, and follow-ups." },
    { icon: "Cog", title: "Customer portal", desc: "Customers track their order with a PO or reference number. Public, branded, mobile-friendly." },
  ],
  modules: ["Inventory", "BOM", "Work Orders", "Job Cards", "Quotations", "Purchase Orders", "Invoices",
            "QC Reports", "CRM / Leads", "Suppliers", "Customers", "Documents", "Dashboard",
            "Customer Portal", "User Roles", "GST"],
  footer_cta_heading: "Ready to run a tighter shop?",
  footer_copyright: "© 2026 Denplex Engineering Company",
  footer_version: "Denplex ERP v0.3 · Built for MSMEs",
  trial_enabled: false,
  footer_cta_sub: "Start a 30-day free trial — no card needed. We verify and email you in 24 hours.",
  sandbox_note: "",
};

const Landing = () => {
  const [cfg, setCfg] = useState(DEFAULTS);

  useEffect(() => {
    let alive = true;
    api.get("/public/site-config").then(r => { if (alive && r?.data) setCfg({ ...DEFAULTS, ...r.data }); })
       .catch(() => {}); // silent — DEFAULTS already rendered
    return () => { alive = false; };
  }, []);

  const c = cfg;

  return (
    <div className="min-h-screen bg-white text-slate-900" data-testid="landing-page">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="brand-link">
            <img src={c.logo_url} alt={c.brand_name} className="h-9 w-9 object-contain" />
            <span className="font-display font-bold tracking-tight text-lg">{c.brand_name}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#modules" className="hover:text-slate-900">Modules</a>
            <Link to="/portal" className="hover:text-slate-900" data-testid="nav-portal-link">Customer Portal</Link>
            {c.trial_enabled ? <Link to="/trial" className="hover:text-slate-900 text-red-600 font-medium" data-testid="nav-trial-link">Free Trial</Link> : null}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" className="rounded-sm" data-testid="nav-login-button">Sign in</Button>
            </Link>
            <Link to="/login">
              <Button className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="nav-cta-button">
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
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600 mb-4">
              {c.overline}
            </div>
            <h1 className="font-display font-bold tracking-tight text-4xl sm:text-5xl lg:text-6xl text-slate-900">
              {c.heading_prefix}<br />the precision of a<span className="text-red-600"> {c.heading_highlight} </span>{c.heading_suffix}
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">
              {c.subheading}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {c.trial_enabled ? (
                <Link to="/trial">
                  <Button className="rounded-sm h-11 px-6 bg-red-600 hover:bg-red-700" data-testid="hero-primary-cta">
                    Start 30-day free trial <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Link to="/login">
                  <Button className="rounded-sm h-11 px-6 bg-red-600 hover:bg-red-700" data-testid="hero-primary-cta">
                    Open dashboard <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              )}
              <Link to="/login">
                <Button variant="outline" className="rounded-sm h-11 px-6 border-slate-300" data-testid="hero-login-cta">
                  Sign in
                </Button>
              </Link>
              <Link to="/portal">
                <Button variant="ghost" className="rounded-sm h-11 px-6 text-slate-700" data-testid="hero-portal-cta">
                  Track an order →
                </Button>
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-3 max-w-md gap-6 border-t border-slate-200 pt-6">
              {(c.stats || []).map((s, i) => <Stat key={i} k={s.k} v={s.v} />)}
            </div>
          </div>
          <div className="lg:col-span-5 relative">
            <div className="relative aspect-[4/5] overflow-hidden border border-slate-200">
              <img src={c.hero_image} alt="precision jig" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/30 via-transparent to-blue-700/20" />
              <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur p-4 border-l-4 border-red-600">
                <div className="text-[10px] font-mono-tech uppercase tracking-widest text-red-600">{c.hero_badge_line1}</div>
                <div className="mt-1 font-display font-semibold text-slate-900">{c.hero_badge_line2}</div>
                <div className="text-xs text-slate-600 mt-0.5">{c.hero_badge_line3}</div>
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
            {(c.features || []).map((f, i) => {
              const Icon = ICONS[f.icon] || Cog;
              return <Feature key={i} icon={<Icon className="h-5 w-5" />} title={f.title} desc={f.desc} />;
            })}
          </div>
        </div>
      </section>

      {/* Modules strip */}
      <section id="modules" className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <div className="aspect-[4/3] overflow-hidden border border-slate-200">
              <img src={c.feature_image} alt="CNC" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="lg:col-span-7">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Built-in modules</div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mt-2 tracking-tight">Everything your workshop needs — nothing it doesn't.</h2>
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
              {(c.modules || []).map(m => (
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
      <section className="bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-red opacity-50" />
        <div className="max-w-7xl mx-auto px-6 py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative">
          <div>
            <h3 className="font-display text-3xl font-bold tracking-tight">{c.footer_cta_heading}</h3>
            {c.trial_enabled ? <p className="text-slate-300 mt-2">{c.footer_cta_sub}</p> : null}
            {c.trial_enabled && c.sandbox_note ? <p className="text-xs text-slate-400 mt-1 font-mono-tech">{c.sandbox_note}</p> : null}
          </div>
          <Link to={c.trial_enabled ? "/trial" : "/login"}>
            <Button className="rounded-sm h-12 px-7 bg-red-600 hover:bg-red-700 text-white border-0" data-testid="footer-cta-button">
              {c.trial_enabled ? "Get started" : "Open dashboard"} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="brand-stripe" />
      </section>

      <footer className="border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-slate-500 flex justify-between">
          <div>{c.footer_copyright}</div>
          <div className="font-mono-tech">{c.footer_version}</div>
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
    <div className="h-9 w-9 bg-red-600 text-white flex items-center justify-center">{icon}</div>
    <div className="mt-4 font-display font-semibold text-lg text-slate-900">{title}</div>
    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{desc}</p>
  </div>
);

export default Landing;
