import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, ArrowLeft, CheckCircle2, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { adminResetPasswordWithSecretServerFn } from "@/lib/api/admin-auth.functions";

export const Route = createFileRoute("/admin/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset Admin Password — Punong Spring Resort" },
      { name: "description", content: "Administrator executive password reset and recovery." },
    ],
  }),
  component: AdminForgotPasswordPage,
});

function AdminForgotPasswordPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    secretCode: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showSecretCode, setShowSecretCode] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = form.email.trim().toLowerCase();

    if (!cleanEmail) {
      toast.error("Please enter your registered administrator email address.");
      return;
    }

    if (!form.secretCode.trim()) {
      toast.error("Please enter the Admin Security Secret.");
      return;
    }

    if (form.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      toast.error("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);

    try {
      await adminResetPasswordWithSecretServerFn({
        data: {
          email: cleanEmail,
          secretCode: form.secretCode.trim(),
          newPassword: form.newPassword,
        },
      });

      setLoading(false);
      setIsSuccess(true);
      toast.success("Your password has been reset successfully! You can now log in.");

      setTimeout(() => {
        navigate({ to: "/admin/login", replace: true });
      }, 3000);
    } catch (err: any) {
      setLoading(false);
      toast.error(err?.message || "Failed to reset administrator password.");
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#060D10] p-4 sm:p-6 overflow-hidden">
      {/* Ambient Glowing Lighting Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none animate-float"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 group transition-transform duration-300 hover:scale-105"
          >
            <img
              src="/logo.png"
              alt="Punong Logo"
              className="h-12 w-12 object-contain rounded-full bg-white/10 p-1 ring-2 ring-[#D4AF37]/60 shadow-[0_0_20px_rgba(212,175,55,0.3)]"
            />
            <div className="flex flex-col text-left">
              <span className="font-display text-2xl font-bold tracking-wide text-white">
                Punong <span className="text-[#D4AF37] font-serif italic">Resort</span>
              </span>
              <span className="text-[10px] tracking-widest uppercase text-amber-200/70 font-semibold">
                Executive Portal
              </span>
            </div>
          </Link>
          <p className="text-slate-400 text-xs tracking-wider">Secure Administrator Password Recovery</p>
        </div>

        {/* Glassmorphic Reset Card */}
        <div className="rounded-3xl border border-[#D4AF37]/25 bg-[#0B171D]/85 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] p-8">
          {isSuccess ? (
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300 py-3">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-950/60 border border-emerald-700/80 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white font-display">Password Reset Successful</h3>
                <p className="text-xs text-emerald-300 font-semibold leading-relaxed">
                  Your administrator password has been updated successfully.
                </p>
                <p className="text-[11px] text-slate-400 pt-1">
                  Redirecting to administrator sign in portal...
                </p>
              </div>

              <Button
                asChild
                className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.25)]"
              >
                <Link to="/admin/login">Proceed to Sign In</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-white font-display flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-[#D4AF37]" /> Reset Admin Password
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Enter your registered administrator email, Admin Security Secret (<code className="text-[#D4AF37] font-semibold">ADMIN2026</code>), and set a new password.
                </p>
              </div>

              {/* Admin Registered Email */}
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">
                  Admin Registered Email
                </Label>
                <Input
                  type="email"
                  required
                  placeholder="admin@punongresort.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="bg-[#050C0E]/80 border-slate-800 text-white placeholder-slate-600 focus:border-[#D4AF37] focus:ring-[#D4AF37] rounded-xl h-11 text-sm"
                />
              </div>

              {/* Admin Security Secret */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">
                    Admin Security Secret
                  </Label>
                  <span className="text-[10px] text-amber-200/70 font-mono">Code: ADMIN2026</span>
                </div>
                <div className="relative">
                  <Input
                    type={showSecretCode ? "text" : "password"}
                    required
                    placeholder="Enter ADMIN2026"
                    value={form.secretCode}
                    onChange={(e) => setForm({ ...form, secretCode: e.target.value })}
                    className="bg-[#050C0E]/80 border-slate-800 text-white focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretCode(!showSecretCode)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-300 focus:outline-none"
                  >
                    {showSecretCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={form.newPassword}
                    onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                    className="bg-[#050C0E]/80 border-slate-800 text-white focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-300 focus:outline-none"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Re-enter new password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    className="bg-[#050C0E]/80 border-slate-800 text-white focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-300 focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all duration-300 text-sm flex items-center justify-center gap-2 mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                    <span>Verifying & Resetting Password...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 text-slate-950" />
                    <span>Reset Admin Password</span>
                  </>
                )}
              </Button>

              <div className="pt-2 text-center">
                <Link
                  to="/admin/login"
                  className="text-xs text-slate-400 hover:text-[#D4AF37] transition-colors inline-flex items-center gap-1.5 font-medium"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Return to Admin Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
