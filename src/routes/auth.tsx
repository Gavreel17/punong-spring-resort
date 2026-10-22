import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Palmtree, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { validatePhilippineMobileNumber } from "@/lib/phone-validation";
import { PhoneInputField } from "@/components/PhoneInputField";
import { markNewRegistration, markSubsequentLogin } from "@/lib/auth-welcome-service";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Punong Spring Resort" },
      { name: "description", content: "Sign in or create your Punong Spring Resort account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [signIn, setSignIn] = useState({ email: "", password: "" });
  const [signUp, setSignUp] = useState({ fullname: "", email: "", phone: "", password: "" });
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  const { user, role, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      if (role === "admin") {
        navigate({ to: "/admin/calendar", replace: true });
      } else {
        navigate({ to: "/dashboard", replace: true });
      }
    }
  }, [user, role, authLoading, navigate]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: signInData, error } = await supabase.auth.signInWithPassword(signIn);
    setLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return toast.error(
          "Please verify your Gmail address before signing in. Check your inbox (or spam folder) for the verification link.",
          { duration: 6000 },
        );
      }
      return toast.error(error.message);
    }

    if (signInData?.user) {
      const isInitialRegSession =
        typeof window !== "undefined" &&
        sessionStorage.getItem(`punong_active_new_reg_${signInData.user.id}`) === "true";

      if (isInitialRegSession) {
        const displayName =
          signInData.user.user_metadata?.fullname ||
          signInData.user.user_metadata?.full_name ||
          "";
        toast.success(displayName ? `Welcome, ${displayName}!` : "Welcome!");
      } else {
        await markSubsequentLogin(signInData.user.id, signInData.user.user_metadata);
        toast.success("Welcome back!");
      }
    }
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    const gmailRegex = /^[a-zA-Z0-9.\+]+@gmail\.com$/;
    if (!gmailRegex.test(signUp.email.toLowerCase())) {
      return toast.error("Please provide a valid Gmail address.");
    }

    const phoneVal = validatePhilippineMobileNumber(signUp.phone, { required: true });
    if (!phoneVal.isValid) {
      return toast.error(phoneVal.error || "Please enter a valid Philippine mobile number starting with 09.");
    }
    setLoading(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: signUp.email,
      password: signUp.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          fullname: signUp.fullname,
          phone: signUp.phone,
          is_new_registration: true,
          login_count: 1,
          registration_date: new Date().toISOString(),
        },
      },
    });
    setLoading(false);
    if (error) {
      const isEmailErr =
        error.message.toLowerCase().includes("confirmation email") ||
        error.message.toLowerCase().includes("email") ||
        error.message.toLowerCase().includes("smtp");

      if (isEmailErr) {
        return toast.success(
          "Account created successfully! You can now sign in with your email and password.",
          { duration: 6000 }
        );
      }
      return toast.error(
        error.message === "Invalid login credentials" ? "Invalid email or password." : error.message
      );
    }

    if (signUpData?.user) {
      await markNewRegistration(signUpData.user.id, signUp.fullname);

      if (signUpData.session) {
        toast.success(`Welcome, ${signUp.fullname}!`);
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      // If session is null, attempt immediate sign-in (e.g. if email confirmation is disabled)
      const { data: autoSignIn, error: autoErr } = await supabase.auth.signInWithPassword({
        email: signUp.email,
        password: signUp.password,
      });

      if (autoSignIn?.user && !autoErr) {
        await markNewRegistration(autoSignIn.user.id, signUp.fullname);
        toast.success(`Welcome, ${signUp.fullname}!`);
        navigate({ to: "/dashboard", replace: true });
        return;
      }
    }

    toast.success(
      "Account created! You can now sign in to manage your bookings.",
      { duration: 6000 }
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] p-4">
      <Card className="w-full max-w-md p-8 shadow-elegant">
        <Link
          to="/"
          className="mb-6 flex items-center justify-center gap-2 font-display text-2xl font-bold text-primary"
        >
          <Palmtree className="h-7 w-7 text-accent" /> Punong Spring Resort
        </Link>
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={onSignIn} className="space-y-4 pt-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={signIn.email}
                  onChange={(e) => setSignIn({ ...signIn, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showSignInPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={signIn.password}
                    onChange={(e) => setSignIn({ ...signIn, password: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignInPassword(!showSignInPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  >
                    {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={onSignUp} className="space-y-4 pt-4">
              <div>
                <Label>Full Name</Label>
                <Input
                  required
                  value={signUp.fullname}
                  onChange={(e) => setSignUp({ ...signUp, fullname: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  pattern=".*@gmail\.com"
                  title="Please enter a valid Gmail address"
                  value={signUp.email}
                  onChange={(e) => setSignUp({ ...signUp, email: e.target.value })}
                />
              </div>
              <PhoneInputField
                label="Mobile Number"
                required
                value={signUp.phone}
                onChange={(phone) => setSignUp({ ...signUp, phone })}
              />
              <div>
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showSignUpPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={signUp.password}
                    onChange={(e) => setSignUp({ ...signUp, password: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  >
                    {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading || !validatePhilippineMobileNumber(signUp.phone, { required: true }).isValid}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {loading ? "Creating..." : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
