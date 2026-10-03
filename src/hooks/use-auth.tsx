import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "customer";

interface AuthCtx {
  user: any | null;
  session: any | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId: string, email?: string) => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("punong_admin_session");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.role === "admin" && (parsed?.id === userId || parsed?.email === email)) {
            return "admin";
          }
        }
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (!error && data) {
        const roles = (data as any[])?.map((r: any) => r.role) ?? [];
        if (roles.includes("admin")) {
          return "admin";
        }
      }
    } catch (e) {
      console.warn("[DEBUG] Exception fetching user role:", e);
    }
    return "customer";
  };

  useEffect(() => {
    // Listen to Supabase Auth state changes directly
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_evt: string, s: any) => {
      console.log("[DEBUG] AuthStateChanged Event:", _evt, "User:", s?.user?.email || "No user");
      if (s?.user) {
        setSession(s);
        const userRole = await fetchUserRole(s.user.id, s.user.email);
        setRole(userRole);
        setLoading(false);
      } else {
        const stored = typeof window !== "undefined" ? localStorage.getItem("punong_admin_session") : null;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.id && parsed?.role === "admin") {
              setSession({ user: { id: parsed.id, email: parsed.email } });
              setRole("admin");
              setLoading(false);
              return;
            }
          } catch (e) {}
        }
        setSession(null);
        setRole(null);
        setLoading(false);
      }
    });

    // Check active Supabase Auth session on mount
    supabase.auth.getSession().then(async ({ data, error }: any) => {
      console.log("[DEBUG] Initial getSession() Result:", { session: data?.session, error });
      if (data?.session?.user) {
        setSession(data.session);
        const userRole = await fetchUserRole(data.session.user.id, data.session.user.email);
        setRole(userRole);
        setLoading(false);
      } else {
        const stored = typeof window !== "undefined" ? localStorage.getItem("punong_admin_session") : null;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.id && parsed?.role === "admin") {
              setSession({ user: { id: parsed.id, email: parsed.email } });
              setRole("admin");
              setLoading(false);
              return;
            }
          } catch (e) {}
        }
        setSession(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        role,
        loading,
        signOut: async () => {
          console.log("[DEBUG] Signing out from Supabase Auth...");
          const wasAdmin = role === "admin" || (typeof window !== "undefined" && !!localStorage.getItem("punong_admin_session"));
          if (typeof window !== "undefined") {
            localStorage.removeItem("punong_admin_session");
          }
          setSession(null);
          setRole(null);
          try {
            await supabase.auth.signOut();
          } catch (e) {
            console.warn("[DEBUG] Supabase Auth signOut notice:", e);
          }
          if (typeof window !== "undefined") {
            window.location.href = wasAdmin ? "/admin/login" : "/";
          }
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
