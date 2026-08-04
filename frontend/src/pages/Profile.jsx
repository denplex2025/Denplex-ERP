import { useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Card } from "@/components/erp/Primitives";
import { toast } from "sonner";
import { UserCircle2, MessageCircle } from "lucide-react";

function Fld({ label, children, hint }) {
  return (
    <div>
      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function ProfileForm() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put("/auth/profile", { name, phone });
      await refreshUser();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <UserCircle2 className="h-5 w-5 text-red-600" />
        <h3 className="font-display text-lg font-semibold">Your details</h3>
      </div>
      <p className="text-sm text-slate-600 mb-5">Add your mobile number to enable WhatsApp-OTP password recovery on the sign-in page.</p>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="profile-form">
        <Fld label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required className="rounded-sm" data-testid="profile-name-input" />
        </Fld>
        <Fld label="Email (sign-in ID)">
          <Input value={user?.email || ""} disabled className="rounded-sm bg-slate-50 text-slate-500" data-testid="profile-email-display" />
        </Fld>
        <Fld label="Mobile number" hint="Used for WhatsApp OTP on the Forgot Password page. Include country code if outside India, e.g. +14155551234.">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210"
            className="rounded-sm" data-testid="profile-phone-input" />
        </Fld>
        <Fld label="Role">
          <Input value={user?.role || ""} disabled className="rounded-sm bg-slate-50 text-slate-500 capitalize" data-testid="profile-role-display" />
        </Fld>
        <div className="md:col-span-2">
          <Button type="submit" disabled={loading} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="profile-save">
            {loading ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ChangePasswordCard() {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (nw !== confirm) { toast.error("New passwords don't match"); return; }
    if (nw.length < 8) { toast.error("Min 8 characters"); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: nw });
      toast.success("Password changed");
      setCur(""); setNw(""); setConfirm("");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };
  return (
    <Card className="p-6 max-w-2xl mt-5">
      <h3 className="font-display text-lg font-semibold mb-1">Change password</h3>
      <p className="text-sm text-slate-600 mb-5">You'll need your current password to set a new one.</p>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="profile-change-password-form">
        <Fld label="Current password"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required className="rounded-sm" data-testid="profile-cur-pw" /></Fld>
        <Fld label="New password"><Input type="password" value={nw} onChange={(e) => setNw(e.target.value)} required minLength={8} className="rounded-sm" data-testid="profile-new-pw" /></Fld>
        <Fld label="Confirm new password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className="rounded-sm" data-testid="profile-confirm-pw" /></Fld>
        <div className="md:col-span-3">
          <Button type="submit" disabled={loading} className="rounded-sm bg-red-600 hover:bg-red-700" data-testid="profile-save-password">
            {loading ? "Saving..." : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function Profile() {
  return (
    <div data-testid="profile-page">
      <PageHeader title="My Profile" subtitle="Manage your account details and password." />
      <div className="mt-5 space-y-1">
        <ProfileForm />
        <ChangePasswordCard />
        <div className="max-w-2xl mt-5 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-sm p-3">
          <MessageCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <span>Forgot your password next time? Use the "Forgot password?" link on the sign-in page — you can reset it by email or, once your mobile number is saved here, by WhatsApp OTP.</span>
        </div>
      </div>
    </div>
  );
}
