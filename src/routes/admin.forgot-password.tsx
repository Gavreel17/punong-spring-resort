import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminRequestPasswordResetServerFn, adminResetPasswordWithSecretServerFn } from "@/lib/api/admin-auth.functions";

export const Route = createFileRoute("/admin/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — Admin | Punong Spring Resort" },
      { name: "description", content: "Administrator password recovery." },
    ],
  }),
  component: AdminForgotPasswordPage,
});

function AdminForgotPasswordPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("email");

  // Email recovery state
  const [email, setEmail] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [smtpErrorNotice, setSmtpErrorNotice] = useState<string | null>(null);

  // Instant secret recovery state
  const [secretForm, setSecretForm] = useState({
    email: "",
    secretCode: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showSecretCode, setShowSecretCode] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [secretSuccess, setSecretSuccess] = useState(false);

  // Countdown timer for resend rate-limiting
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  async function onSendEmail(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      toast.error("Please enter your administrator email address.");
      return;
    }

    if (cooldown > 0) {
      toast.warning(`Please wait ${cooldown} seconds before requesting another reset link.`);
      return;
    }

    setLoadingEmail(true);
    setSmtpErrorNotice(null);

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const res = await adminRequestPasswordResetServerFn({
        data: {
          email: cleanEmail,
          origin,
        },
      });

      setLoadingEmail(false);
      setSubmittedEmail(true);
      setCooldown(60); // 60s cooldown

      toast.success(res.message || "Password reset instructions dispatched.");
    } catch (err: any) {
      setLoadingEmail(false);
      const errMsg = err?.message || "Failed to process recovery request.";
      setSmtpErrorNotice(errMsg);
      toast.error(errMsg);
    }
  }

  async function onResetWithSecret(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = secretForm.email.trim().toLowerCase();

    if (!cleanEmail) {
      toast.error("Please enter your administrator email address.");
      return;
    }

    if (!secretForm.secretCode.trim()) {
      toast.error("Please enter the Admin Security Secret.");
      return;
    }

    if (secretForm.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }

    if (secretForm.newPassword !== secretForm.confirmPassword) {
      toast.error("Passwords do not match. Please re-enter.");
      return;
    }

    setLoadingSecret(true);

    try {
      const res = await adminResetPasswordWithSecretServerFn({
        data: {
          email: cleanEmail,
          secretCode: secretForm.secretCode.trim(),
          newPassword: secretForm.newPassword,
        },
      });

      setLoadingSecret(false);
      setSecretSuccess(true);
      toast.success("Your password has been reset successfully. You can now log in using your new password.");

      setTimeout(() => {
        navigate({ to: "/admin/login", replace: true });
      }, 3500);
    } catch (err: any) {
      setLoadingSecret(false);
      toast.error(err?.message || "Failed to reset password.");
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
          <p className="text-slate-400 text-xs tracking-wider">Secured Administrative Password Recovery</p>
        </div>

        {/* Glassmorphic Card */}
        <div className="rounded-3xl border border-[#D4AF37]/25 bg-[#0B171D]/85 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-[#050C0E] text-slate-400 border-b border-[#D4AF37]/20 p-0 h-12">
              <TabsTrigger
                value="email"
                className="data-[state=active]:bg-[#0B171D] data-[state=active]:text-[#D4AF37] data-[state=active]:font-bold text-xs rounded-none h-full transition-colors flex items-center justify-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" /> Recovery Link
              </TabsTrigger>
              <TabsTrigger
                value="secret"
                className="data-[state=active]:bg-[#0B171D] data-[state=active]:text-[#D4AF37] data-[state=active]:font-bold text-xs rounded-none h-full transition-colors flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Instant Secret Reset
              </TabsTrigger>
            </TabsList>

            <div className="p-8">
              {/* Tab 1: Email Recovery Link */}
              <TabsContent value="email" className="mt-0 outline-none">
                {!submittedEmail ? (
                  <form onSubmit={onSendEmail} className="space-y-5">
                    <div className="mb-6">
                      <h2 className="text-xl font-bold text-white font-display flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-[#D4AF37]" /> Email Password Recovery
                      </h2>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                        Enter your registered administrator email address to receive a secure recovery link.
                      </p>
                    </div>

                    {smtpErrorNotice && (
                      <div className="bg-rose-950/60 border border-rose-800/80 rounded-xl p-3.5 space-y-2 text-xs text-rose-300">
                        <div className="flex items-center gap-1.5 font-bold text-rose-200">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>Email Delivery Warning</span>
                        </div>
                        <p className="leading-relaxed text-[11px] text-rose-300/90">{smtpErrorNotice}</p>
                        <div className="pt-1">
                          <Button
                            type="button"
                            onClick={() => setActiveTab("secret")}
                            size="sm"
                            className="bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold text-[11px] h-8 rounded-lg w-full"
                          >
                            Use Instant Security Secret Instead
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">
                        Admin Registered Email
                      </Label>
                      <div className="relative">
                        <Input
                          type="email"
                          required
                          placeholder="admin@punongresort.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="bg-[#050C0E]/80 border-slate-800 text-white placeholder-slate-600 focus:border-[#D4AF37] focus:ring-[#D4AF37] pl-10 rounded-xl h-11 text-sm"
                        />
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={loadingEmail || cooldown > 0}
                      className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all duration-300 text-sm flex items-center justify-center gap-2"
                    >
                      {loadingEmail ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                          <span>Dispatching Recovery Link...</span>
                        </>
                      ) : cooldown > 0 ? (
                        <span>Resend Available in {cooldown}s</span>
                      ) : (
                        <span>Send Recovery Link</span>
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
                ) : (
                  <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.25)]">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-white font-display">
                        Recovery Instructions Dispatched
                      </h3>
                      <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                        If an authorized administrator account is associated with <span className="font-semibold text-white font-mono">{email}</span>, a secure password recovery link has been sent.
                      </p>
                    </div>

                    <div className="bg-[#050C0E]/70 border border-slate-800 rounded-xl p-4 text-left space-y-2 text-xs text-slate-400">
                      <div className="flex items-center gap-2 font-semibold text-slate-200">
                        <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0" />
                        <span>Next Steps:</span>
                      </div>
                      <ul className="list-disc pl-5 space-y-1 text-slate-400">
                        <li>Check your email inbox and spam / promotions folder.</li>
                        <li>Click the recovery link to set your new password.</li>
                        <li>For security, the recovery link is single-use and time-limited.</li>
                      </ul>
                    </div>

                    <div className="pt-2 space-y-3">
                      <Button
                        onClick={onSendEmail}
                        disabled={loadingEmail || cooldown > 0}
                        variant="outline"
                        className="w-full border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 hover:text-white rounded-xl h-10 text-xs font-semibold"
                      >
                        {cooldown > 0 ? `Resend Link in ${cooldown}s` : "Resend Recovery Email"}
                      </Button>

                      <div>
                        <Link
                          to="/admin/login"
                          className="text-xs text-slate-400 hover:text-[#D4AF37] transition-colors inline-flex items-center gap-1.5 font-medium"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" /> Return to Admin Sign In
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Tab 2: Instant Secret Reset */}
              <TabsContent value="secret" className="mt-0 outline-none">
                {secretSuccess ? (
                  <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300 py-4">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-700/80 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-white font-display">Password Reset Successfully</h3>
                      <p className="text-xs text-emerald-300 font-semibold leading-relaxed">
                        Your password has been reset successfully. You can now log in using your new password.
                      </p>
                      <p className="text-[11px] text-slate-400 pt-1">
                        Redirecting you to the administrator sign in portal...
                      </p>
                    </div>

                    <Button asChild className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.25)]">
                      <Link to="/admin/login">Proceed to Admin Sign In</Link>
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={onResetWithSecret} className="space-y-4">
                    <div className="mb-5">
                      <h2 className="text-xl font-bold text-white font-display flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-[#D4AF37]" /> Instant Executive Reset
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Reset credentials immediately using your Admin Security Secret (<code className="text-[#D4AF37]">ADMIN2026</code>).
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">
                        Admin Email
                      </Label>
                      <Input
                        type="email"
                        required
                        placeholder="admin@punongresort.com"
                        value={secretForm.email}
                        onChange={(e) => setSecretForm({ ...secretForm, email: e.target.value })}
                        className="bg-[#050C0E]/80 border-slate-800 text-white placeholder-slate-600 focus:border-[#D4AF37] focus:ring-[#D4AF37] rounded-xl h-11 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">
                        Admin Security Secret
                      </Label>
                      <div className="relative">
                        <Input
                          type={showSecretCode ? "text" : "password"}
                          required
                          placeholder="Security Secret (e.g. ADMIN2026)"
                          value={secretForm.secretCode}
                          onChange={(e) => setSecretForm({ ...secretForm, secretCode: e.target.value })}
                          className="bg-[#050C0E]/80 border-slate-800 text-white focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11 text-sm"
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

                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">
                        New Password
                      </Label>
                      <div className="relative">
                        <Input
                          type={showNewPassword ? "text" : "password"}
                          required
                          minLength={8}
                          placeholder="Minimum 8 characters"
                          value={secretForm.newPassword}
                          onChange={(e) => setSecretForm({ ...secretForm, newPassword: e.target.value })}
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
                          value={secretForm.confirmPassword}
                          onChange={(e) => setSecretForm({ ...secretForm, confirmPassword: e.target.value })}
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

                    <Button
                      type="submit"
                      disabled={loadingSecret}
                      className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all duration-300 text-sm flex items-center justify-center gap-2 mt-2"
                    >
                      {loadingSecret ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                          <span>Verifying Secret & Resetting...</span>
                        </>
                      ) : (
                        <span>Reset Admin Password Now</span>
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
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
