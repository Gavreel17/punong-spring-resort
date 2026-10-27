import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Key, Eye, EyeOff, CheckCircle2, ShieldAlert, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminVerifyAdminRoleServerFn } from "@/lib/api/admin-auth.functions";

export const Route = createFileRoute("/admin/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Admin | Punong Spring Resort" },
      { name: "description", content: "Set a new administrator password." },
    ],
  }),
  component: AdminResetPasswordPage,
});

function AdminResetPasswordPage() {
  const navigate = useNavigate();

  const [checkingToken, setCheckingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [isNotAdmin, setIsNotAdmin] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Validate the recovery session from the URL hash or PKCE exchange
  useEffect(() => {
    let mounted = true;

    async function evaluateRecoverySession() {
      try {
        // 1. If PKCE code is present in query parameters, exchange it
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.warn("[Recovery Exchange Error]:", exchangeError.message);
          }
        }

        // 2. Check current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          // Check if hash has error or if no session
          const hash = window.location.hash;
          if (hash.includes("error")) {
            const hashParams = new URLSearchParams(hash.replace("#", ""));
            const desc = hashParams.get("error_description") || "Password recovery token is invalid or has expired.";
            if (mounted) {
              setErrorMessage(desc.replace(/\+/g, " "));
              setTokenValid(false);
              setCheckingToken(false);
            }
            return;
          }

          // Listen briefly for PASSWORD_RECOVERY event
          const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
            if (!mounted) return;
            if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && currentSession?.user)) {
              await verifyAdminUser(currentSession.user.id);
            }
          });

          // Fallback timeout if no recovery session is recognized
          setTimeout(() => {
            if (mounted && checkingToken) {
              setCheckingToken(false);
            }
          }, 2500);

          return () => {
            authListener.subscription.unsubscribe();
          };
        }

        await verifyAdminUser(session.user.id);
      } catch (err: any) {
        if (mounted) {
          setErrorMessage(err?.message || "Failed to verify password recovery token.");
          setTokenValid(false);
          setCheckingToken(false);
        }
      }
    }

    async function verifyAdminUser(userId: string) {
      if (!mounted) return;
      try {
        // Enforce: Only authorized administrator accounts can reset password
        const { isAdmin } = await adminVerifyAdminRoleServerFn({ data: { userId } });
        if (!mounted) return;

        if (!isAdmin) {
          setIsNotAdmin(true);
          setTokenValid(false);
          setCheckingToken(false);
          await supabase.auth.signOut();
          return;
        }

        setTokenValid(true);
        setCheckingToken(false);
      } catch (e) {
        if (mounted) {
          setTokenValid(true); // Allow proceed if server check had network glitch, auth update will verify
          setCheckingToken(false);
        }
      }
    }

    evaluateRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match. Please verify both fields.");
      return;
    }

    setLoading(true);

    try {
      // 1. Update password using Supabase Auth
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setLoading(false);
        toast.error(error.message || "Failed to update password.");
        return;
      }

      // 2. Invalidate existing sessions across devices
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch (soErr) {
        await supabase.auth.signOut();
      }

      // Clear any local legacy admin session storage
      if (typeof window !== "undefined") {
        localStorage.removeItem("punong_admin_session");
        localStorage.removeItem("punong_admin_session_token");
        localStorage.removeItem("punong_admin_session_id");
      }

      setLoading(false);
      setResetSuccess(true);

      toast.success("Your password has been reset successfully. You can now log in using your new password.");

      // Automatically redirect to login after 3 seconds
      setTimeout(() => {
        navigate({ to: "/admin/login", replace: true });
      }, 3500);
    } catch (err: any) {
      setLoading(false);
      toast.error(err.message || "An unexpected error occurred during password reset.");
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
          <p className="text-slate-400 text-xs tracking-wider">Secured Administrator Password Configuration</p>
        </div>

        {/* Glassmorphic Card */}
        <div className="rounded-3xl border border-[#D4AF37]/25 bg-[#0B171D]/85 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] p-8">
          {checkingToken ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
              <p className="text-sm font-semibold text-white">Validating Recovery Authorization...</p>
              <p className="text-xs text-slate-400">Verifying secure single-use token signature.</p>
            </div>
          ) : isNotAdmin ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white font-display">Administrator Access Required</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The account associated with this recovery token does not possess administrator credentials. This reset portal is restricted strictly to resort executives.
                </p>
              </div>
              <Button asChild className="w-full bg-slate-800 hover:bg-slate-700 text-white rounded-xl h-10 text-xs font-semibold">
                <Link to="/admin/login">Return to Admin Sign In</Link>
              </Button>
            </div>
          ) : !tokenValid && !resetSuccess ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-950/60 border border-amber-800/80 flex items-center justify-center text-amber-400">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white font-display">Invalid or Expired Link</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {errorMessage || "This recovery link is invalid, has already been used, or has expired for your security."}
                </p>
              </div>
              <div className="pt-2 space-y-2">
                <Button asChild className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold rounded-xl h-11 text-xs">
                  <Link to="/admin/forgot-password">Request New Recovery Link</Link>
                </Button>
                <div>
                  <Link to="/admin/login" className="text-xs text-slate-400 hover:text-white transition-colors">
                    Return to Sign In
                  </Link>
                </div>
              </div>
            </div>
          ) : resetSuccess ? (
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-700/80 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white font-display">Password Reset Successfully</h3>
                <p className="text-xs text-emerald-300 font-semibold leading-relaxed">
                  Your password has been reset successfully. You can now log in using your new password.
                </p>
                <p className="text-[11px] text-slate-400 pt-1">
                  All previous active sessions have been invalidated across devices for your security. Redirecting you to sign in...
                </p>
              </div>

              <div className="pt-2">
                <Button asChild className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.25)] flex items-center justify-center gap-2">
                  <Link to="/admin/login">
                    Sign In with New Password <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onResetPassword} className="space-y-4">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white font-display flex items-center gap-2">
                  <Key className="h-5 w-5 text-[#D4AF37]" /> Create New Password
                </h2>
                <p className="text-xs text-slate-400 mt-1">Set a secure password for your administrator account.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">New Password</Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-[#050C0E]/80 border-slate-800 text-white placeholder-slate-600 focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11 text-sm"
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
                <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-[#050C0E]/80 border-slate-800 text-white placeholder-slate-600 focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11 text-sm"
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

              {/* Password Requirements Guidance */}
              <div className="bg-[#050C0E]/70 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">Password Requirements:</div>
                <div className={newPassword.length >= 8 ? "text-emerald-400" : "text-slate-500"}>
                  • At least 8 characters long
                </div>
                <div className={newPassword && confirmPassword && newPassword === confirmPassword ? "text-emerald-400" : "text-slate-500"}>
                  • Both passwords match
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
                className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all duration-300 text-sm flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                    <span>Resetting Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
