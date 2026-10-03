import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Database, ShieldCheck, Key, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin Login — Punong Spring Resort" },
      { name: "description", content: "Administrator secure sign in." },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("signin");
  const [signIn, setSignIn] = useState({ email: "", password: "" });
  const [signUp, setSignUp] = useState({ fullname: "", email: "", password: "", secretCode: "" });
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSecretCode, setShowSecretCode] = useState(false);

  const [adminAlreadyExists, setAdminAlreadyExists] = useState<boolean | null>(null);

  // Check if admin already exists to conditionally hide registration tab
  useEffect(() => {
    import("@/lib/api/admin-auth.functions").then(({ checkAdminExistsServerFn }) => {
      checkAdminExistsServerFn().then((res) => {
        setAdminAlreadyExists(res.adminExists);
      }).catch(() => {});
    });
  }, []);

  // Block logged-in customers from accessing admin login
  useEffect(() => {
    if (!authLoading && user) {
      if (role === "admin") {
        navigate({ to: "/admin/calendar", replace: true });
      } else {
        toast.error("Access denied. Customer accounts cannot access the Administrator portal.");
        navigate({ to: "/dashboard", replace: true });
      }
    }
  }, [user, role, authLoading, navigate]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const cleanEmail = signIn.email.trim().toLowerCase();

    const supabaseUrl = "https://dqpbbzsxfwbozqcguwux.supabase.co";
    console.log("[DEBUG] Supabase Project URL:", supabaseUrl);
    console.log("[DEBUG] Attempting Supabase Auth signInWithPassword for:", cleanEmail);

    try {
      // 1. Authenticate using Supabase Auth signInWithPassword
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: signIn.password,
      });

      console.log("[DEBUG] signInWithPassword() Result:", { data: signInData, error: signInError });

      if (signInError) {
        const msg = signInError.message;
        // If email not confirmed or GoTrue blocks email confirmation:
        if (msg.toLowerCase().includes("email not confirmed") || msg.toLowerCase().includes("confirmation")) {
          const { adminSignInServerFn } = await import("@/lib/api/admin-auth.functions");
          const serverRes = await adminSignInServerFn({
            data: { email: cleanEmail, password: signIn.password },
          });
          if (serverRes?.user) {
            setLoading(false);
            toast.success("Welcome to the Admin Dashboard!");
            return navigate({ to: "/admin/calendar" });
          }
        }
        setLoading(false);
        if (msg.toLowerCase().includes("invalid login credentials")) {
          return toast.error("Invalid email or password.");
        }
        return toast.error(msg);
      }

      if (!signInData?.user) {
        setLoading(false);
        return toast.error("Invalid email or password.");
      }

      // 2. Verify active user session with getUser()
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
      console.log("[DEBUG] getUser() Result:", { user: authUser, error: userError });

      const activeUserId = authUser?.id || signInData?.user?.id;

      if (!activeUserId) {
        setLoading(false);
        return toast.error("Invalid email or password.");
      }

      // 3. Verify user has admin role in user_roles table
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", activeUserId);

      const roles = (roleData as any[])?.map((r: any) => r.role) ?? [];
      const isAdmin = roles.includes("admin");

      if (!isAdmin) {
        // Strictly reject customer accounts from logging into admin portal
        await supabase.auth.signOut();
        if (typeof window !== "undefined") {
          localStorage.removeItem("punong_admin_session");
        }
        setLoading(false);
        return toast.error("Access denied. Customer accounts cannot log in to the admin portal.");
      }

      localStorage.setItem(
        "punong_admin_session",
        JSON.stringify({ id: activeUserId, email: cleanEmail, role: "admin" })
      );

      setLoading(false);
      toast.success("Welcome to the Admin Dashboard!");
      setTimeout(() => {
        window.location.href = "/admin/calendar";
      }, 100);
      return;
    } catch (err: any) {
      setLoading(false);
      console.error("[DEBUG] Admin Sign In Error:", err);
      toast.error(err.message || "Invalid email or password.");
    }
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();

    // Client-side field validations
    if (!signUp.fullname.trim()) {
      return toast.error("Please enter your full name.");
    }
    if (!signUp.email.trim()) {
      return toast.error("Please enter a valid email address.");
    }
    if (signUp.password.length < 6) {
      return toast.error("Password must be at least 6 characters.");
    }
    if (signUp.secretCode !== "ADMIN2026" && signUp.secretCode !== "punong") {
      return toast.error("Invalid Admin Security Secret.");
    }

    setLoading(true);

    // Enforce single admin limit
    try {
      const { checkAdminExistsServerFn } = await import("@/lib/api/admin-auth.functions");
      const { adminExists } = await checkAdminExistsServerFn();
      if (adminExists) {
        setLoading(false);
        return toast.error("An administrator account already exists. Only one administrator is allowed.");
      }
    } catch (e) {}

    const supabaseUrl = "https://dqpbbzsxfwbozqcguwux.supabase.co";
    console.log("[DEBUG] Supabase Project URL:", supabaseUrl);
    console.log("[DEBUG] Executing supabase.auth.signUp() for:", signUp.email);

    try {
      // 1. Create user in Supabase Authentication via signUp()
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: signUp.email,
        password: signUp.password,
        options: {
          data: { full_name: signUp.fullname, role: "admin" },
        },
      });

      console.log("[DEBUG] signUp() Result:", { data: signUpData, error: signUpError });
      console.log("[DEBUG] Auth User ID:", signUpData?.user?.id || "None returned");

      if (signUpError) {
        const errTxt = signUpError.message.toLowerCase();
        if (errTxt.includes("user already registered") || errTxt.includes("already exists")) {
          setLoading(false);
          return toast.error("This email is already registered. Please sign in instead.");
        }

        const isEmailWarning =
          errTxt.includes("confirmation email") ||
          errTxt.includes("smtp") ||
          errTxt.includes("email");

        if (!signUpData?.user?.id && !isEmailWarning) {
          setLoading(false);
          return toast.error(signUpError.message);
        }
      }

      let authUserId = signUpData?.user?.id ?? null;

      const cleanEmail = signUp.email.trim().toLowerCase();

      // ALWAYS execute server function to guarantee role is set to 'admin' in public.user_roles with server privileges
      try {
        const { adminSignUpServerFn } = await import("@/lib/api/admin-auth.functions");
        const res = await adminSignUpServerFn({
          data: {
            fullname: signUp.fullname,
            email: cleanEmail,
            password: signUp.password,
            secretCode: signUp.secretCode,
          },
        });
        if (res?.user?.id) {
          authUserId = res.user.id;
        }
      } catch (serverErr: any) {
        console.warn("[DEBUG] Server function admin promotion notice:", serverErr);
      }

      // 3. Complete Registration and prepare for Sign In
      setLoading(false);
      toast.success("Admin account created successfully. You may now sign in.");
      setSignIn({ email: cleanEmail, password: signUp.password });
      setActiveTab("signin");
    } catch (err: any) {
      setLoading(false);
      console.error("[DEBUG] Admin Registration Exception:", err);
      toast.error(err.message || "Failed to register admin account.");
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
          <p className="text-slate-400 text-xs tracking-wider">Secured Administrative Operations Suite</p>
        </div>

        {/* Glassmorphic Login Card */}
        <div className="rounded-3xl border border-[#D4AF37]/25 bg-[#0B171D]/85 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${!adminAlreadyExists ? "grid-cols-2" : "grid-cols-1"} bg-[#050C0E] text-slate-400 border-b border-[#D4AF37]/20 p-0 h-12`}>
              <TabsTrigger
                value="signin"
                className="data-[state=active]:bg-[#0B171D] data-[state=active]:text-[#D4AF37] data-[state=active]:font-bold text-xs rounded-none h-full transition-colors"
              >
                Sign In
              </TabsTrigger>
              {!adminAlreadyExists && (
                <TabsTrigger
                  value="signup"
                  className="data-[state=active]:bg-[#0B171D] data-[state=active]:text-[#D4AF37] data-[state=active]:font-bold text-xs rounded-none h-full transition-colors"
                >
                  Register Admin
                </TabsTrigger>
              )}
            </TabsList>

            <div className="p-8">
              <TabsContent value="signin" className="mt-0 outline-none">
                <form onSubmit={onSignIn} className="space-y-4">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-white font-display flex items-center gap-2">
                      <Key className="h-5 w-5 text-[#D4AF37]" /> Admin Authentication
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">Enter your credentials to manage resort operations.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">Admin Email</Label>
                    <Input
                      type="email"
                      required
                      placeholder="admin@punongresort.com"
                      value={signIn.email}
                      onChange={(e) => setSignIn({ ...signIn, email: e.target.value })}
                      className="bg-[#050C0E]/80 border-slate-800 text-white placeholder-slate-600 focus:border-[#D4AF37] focus:ring-[#D4AF37] rounded-xl h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">Password</Label>
                    <div className="relative">
                      <Input
                        type={showSignInPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={signIn.password}
                        onChange={(e) => setSignIn({ ...signIn, password: e.target.value })}
                        className="bg-[#050C0E]/80 border-slate-800 text-white focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignInPassword(!showSignInPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-300 focus:outline-none"
                      >
                        {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all duration-300"
                  >
                    {loading ? "Authenticating..." : "Authenticate Admin"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0 outline-none">
                <form onSubmit={onSignUp} className="space-y-4">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-white font-display flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-[#D4AF37]" /> Create Admin Account
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">Register executive credentials with Security Secret.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">Full Name</Label>
                    <Input
                      type="text"
                      required
                      placeholder="Executive Administrator"
                      value={signUp.fullname}
                      onChange={(e) => setSignUp({ ...signUp, fullname: e.target.value })}
                      className="bg-[#050C0E]/80 border-slate-800 text-white placeholder-slate-600 focus:border-[#D4AF37] focus:ring-[#D4AF37] rounded-xl h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">Admin Email</Label>
                    <Input
                      type="email"
                      required
                      placeholder="admin@punongresort.com"
                      value={signUp.email}
                      onChange={(e) => setSignUp({ ...signUp, email: e.target.value })}
                      className="bg-[#050C0E]/80 border-slate-800 text-white placeholder-slate-600 focus:border-[#D4AF37] focus:ring-[#D4AF37] rounded-xl h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">Password</Label>
                    <div className="relative">
                      <Input
                        type={showSignUpPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={signUp.password}
                        onChange={(e) => setSignUp({ ...signUp, password: e.target.value })}
                        className="bg-[#050C0E]/80 border-slate-800 text-white focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-300 focus:outline-none"
                      >
                        {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs uppercase font-semibold tracking-wider">Admin Security Secret</Label>
                    <div className="relative">
                      <Input
                        type={showSecretCode ? "text" : "password"}
                        required
                        placeholder="Security Secret Code"
                        value={signUp.secretCode}
                        onChange={(e) => setSignUp({ ...signUp, secretCode: e.target.value })}
                        className="bg-[#050C0E]/80 border-slate-800 text-white focus:border-[#D4AF37] focus:ring-[#D4AF37] pr-10 rounded-xl h-11"
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

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#D4AF37] hover:bg-[#c49f27] text-slate-950 font-bold h-11 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all duration-300"
                  >
                    {loading ? "Creating Account..." : "Create Admin Account"}
                  </Button>
                </form>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
