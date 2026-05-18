import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Cog, ArrowLeft } from "lucide-react";

const AUTH_IMG = "https://static.prod-images.emergentagent.com/jobs/7f514505-bc8d-48ed-954b-5815c5f6170a/images/cb22e629690813a8f97ff85f0f116a8265e6e640f54f29986e2c004002dc647a.png";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@erp.com");
  const [password, setPassword] = useState("Admin@123");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav("/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white" data-testid="login-page">
      <div className="hidden lg:block relative">
        <img src={AUTH_IMG} alt="factory" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/80 via-slate-900/30 to-blue-700/20" />
        <div className="relative h-full flex flex-col justify-between p-10 text-white">
          <Link to="/" className="flex items-center gap-2.5" data-testid="login-brand">
            <div className="h-7 w-7 bg-white flex items-center justify-center">
              <Cog className="h-4 w-4 text-slate-900" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold tracking-tight">PRECISION ERP</span>
          </Link>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-blue-300 mb-2">Manufacturing OS</div>
            <h2 className="font-display text-4xl font-bold leading-tight max-w-md">From raw bar to dispatched part — one source of truth.</h2>
            <p className="mt-3 text-slate-300 text-sm max-w-md">Inventory, BOM, work orders, QC, GST invoicing & customer portal for precision engineering MSMEs.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-8" data-testid="back-to-home">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to home
          </Link>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Sign in</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 text-slate-900">Welcome back.</h1>
          <p className="text-sm text-slate-600 mt-2">Use the seeded admin account to explore.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
            <div>
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-600">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-blue-600" data-testid="login-email-input" />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-600">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-blue-600" data-testid="login-password-input" />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 rounded-sm bg-blue-700 hover:bg-blue-800 font-medium" data-testid="login-submit-button">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-slate-50 border border-slate-200 text-xs">
            <div className="font-semibold text-slate-700 uppercase tracking-wider">Demo credentials</div>
            <div className="mt-1.5 font-mono-tech text-slate-600">admin@erp.com · Admin@123</div>
          </div>
          <div className="mt-6 text-center">
            <Link to="/portal" className="text-sm text-slate-600 hover:text-blue-700" data-testid="portal-link-from-login">Track an order in the customer portal →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
