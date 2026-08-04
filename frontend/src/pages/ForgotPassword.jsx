import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Mail, MessageCircle, CheckCircle2 } from "lucide-react";

function EmailLinkTab() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="mt-6 text-center py-6" data-testid="forgot-email-sent">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
        <p className="text-sm text-slate-700">
          If <strong>{email}</strong> is registered, we've sent a password reset link. It expires in 30 minutes — check your inbox (and spam folder).
        </p>
        <Button variant="outline" size="sm" className="mt-4 rounded-sm" onClick={() => setSent(false)}>Send another link</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" data-testid="forgot-email-form">
      <div>
        <Label htmlFor="fp-email" className="text-xs font-semibold uppercase tracking-wider text-slate-600">Email</Label>
        <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          placeholder="you@denplex.co"
          className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-red-600" data-testid="forgot-email-input" />
      </div>
      <Button type="submit" disabled={loading} className="w-full h-11 rounded-sm bg-red-600 hover:bg-red-700 font-medium" data-testid="forgot-email-submit">
        {loading ? "Sending..." : "Send reset link"}
      </Button>
      <p className="text-xs text-slate-500">We'll email a one-time link to reset your password. It's valid for 30 minutes.</p>
    </form>
  );
}

function OtpTab() {
  const nav = useNavigate();
  const [step, setStep] = useState("phone"); // phone -> verify
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  const requestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/otp/request", { phone });
      toast.success("If that number is registered, an OTP was sent on WhatsApp.");
      setStep("verify");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (pw1.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (pw1 !== pw2) { toast.error("Passwords don't match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/otp/verify", { phone, otp, new_password: pw1 });
      toast.success("Password reset. Please sign in with your new password.");
      nav("/login");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  if (step === "phone") {
    return (
      <form onSubmit={requestOtp} className="mt-6 space-y-4" data-testid="forgot-otp-phone-form">
        <div>
          <Label htmlFor="fp-phone" className="text-xs font-semibold uppercase tracking-wider text-slate-600">Mobile number</Label>
          <Input id="fp-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required
            placeholder="9876543210 or +919876543210"
            className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-red-600" data-testid="forgot-otp-phone-input" />
          <p className="text-xs text-slate-500 mt-1">Must match the mobile number saved on your profile.</p>
        </div>
        <Button type="submit" disabled={loading} className="w-full h-11 rounded-sm bg-red-600 hover:bg-red-700 font-medium" data-testid="forgot-otp-send">
          {loading ? "Sending..." : "Send OTP on WhatsApp"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyOtp} className="mt-6 space-y-4" data-testid="forgot-otp-verify-form">
      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-sm px-3 py-2">
        OTP sent to <strong>{phone}</strong> on WhatsApp. <button type="button" onClick={() => setStep("phone")} className="text-red-600 hover:underline ml-1">Change number</button>
      </div>
      <div>
        <Label htmlFor="fp-otp" className="text-xs font-semibold uppercase tracking-wider text-slate-600">6-digit OTP</Label>
        <Input id="fp-otp" value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={6}
          className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-red-600 font-mono-tech" data-testid="forgot-otp-code-input" />
      </div>
      <div>
        <Label htmlFor="fp-pw1" className="text-xs font-semibold uppercase tracking-wider text-slate-600">New password</Label>
        <Input id="fp-pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} required minLength={8}
          className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-red-600" data-testid="forgot-otp-pw1-input" />
      </div>
      <div>
        <Label htmlFor="fp-pw2" className="text-xs font-semibold uppercase tracking-wider text-slate-600">Confirm new password</Label>
        <Input id="fp-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8}
          className="mt-1.5 rounded-sm border-slate-300 focus-visible:ring-red-600" data-testid="forgot-otp-pw2-input" />
      </div>
      <Button type="submit" disabled={loading} className="w-full h-11 rounded-sm bg-red-600 hover:bg-red-700 font-medium" data-testid="forgot-otp-submit">
        {loading ? "Resetting..." : "Reset password"}
      </Button>
    </form>
  );
}

export default function ForgotPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" data-testid="forgot-password-page">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm p-8">
        <Link to="/login" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-6" data-testid="back-to-login">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to sign in
        </Link>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Account recovery</div>
        <h1 className="font-display text-2xl font-bold tracking-tight mt-2 text-slate-900">Reset your password</h1>
        <p className="text-sm text-slate-600 mt-2">Choose how you'd like to verify it's you.</p>

        <Tabs defaultValue="email" className="mt-6">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="email" data-testid="forgot-tab-email"><Mail className="h-4 w-4 mr-1.5" /> Email link</TabsTrigger>
            <TabsTrigger value="otp" data-testid="forgot-tab-otp"><MessageCircle className="h-4 w-4 mr-1.5" /> Mobile OTP</TabsTrigger>
          </TabsList>
          <TabsContent value="email"><EmailLinkTab /></TabsContent>
          <TabsContent value="otp"><OtpTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
