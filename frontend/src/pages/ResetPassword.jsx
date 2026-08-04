import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, AlertTriangle } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" data-testid="reset-password-missing-token">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="font-display text-xl font-bold text-slate-900">Invalid reset link</h1>
          <p className="text-sm text-slate-600 mt-2">This link is missing its reset token. Please request a new password reset link.</p>
          <Link to="/forgot-password" className="inline-block mt-4 text-sm text-red-600 hover:underline">Request a new link</Link>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (pw1.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (pw1 !== pw2) { toast.error("Passwords don't match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw1 });
      toast.success("Password reset. Please sign in with your new password.");
      nav("/login");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "This link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" data-testid="reset-password-page">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm p-8">
        <Link to="/login" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-6" data-testid="back-to-login">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to sign in
        </Link>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Set new password</div>
        <h1 className="font-display text-2xl font-bold tracking-tight mt-2 text-slate-900">Choose a new password</h1>
        <p className="text-sm text-slate-600 mt-2">Make it at least 8 characters.</p>

        <form onSubmit={submit} className="mt-6 space-y-4" data-testid="reset-password-form">
          <div>
            <Label htmlFor="rp-pw1" className="text-xs font-semibold uppercase tracking-wider text-slate-600">New password</Label>
            <Input id="rp-pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} required minLength={8}
              className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-red-600" data-testid="reset-password-pw1-input" />
          </div>
          <div>
            <Label htmlFor="rp-pw2" className="text-xs font-semibold uppercase tracking-wider text-slate-600">Confirm new password</Label>
            <Input id="rp-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8}
              className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-red-600" data-testid="reset-password-pw2-input" />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-11 rounded-sm bg-red-600 hover:bg-red-700 font-medium" data-testid="reset-password-submit">
            {loading ? "Resetting..." : "Reset password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
