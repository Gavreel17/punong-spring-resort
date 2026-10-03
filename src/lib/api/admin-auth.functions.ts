import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import ws from "ws";

if (typeof window === "undefined" && typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = ws;
}

export const checkAdminExistsServerFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL || "https://dqpbbzsxfwbozqcguwux.supabase.co";
    const supabaseAnonKey =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      realtime: { transport: ws as any },
    });

    const { data: adminRoles } = await (client as any)
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    return { adminExists: (adminRoles as any[])?.length > 0 };
  } catch (e) {
    return { adminExists: false };
  }
});

export const adminSignUpServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      fullname: z.string().min(1, "Full name is required."),
      email: z.string().email("Please enter a valid email address."),
      password: z.string().min(6, "Password must be at least 6 characters."),
      secretCode: z.string().min(1, "Admin Security Secret is required."),
    })
  )
  .handler(async ({ data }) => {
    const cleanEmail = data.email.trim().toLowerCase();

    // 1. Validate Admin Security Secret
    if (data.secretCode !== "ADMIN2026" && data.secretCode !== "punong") {
      throw new Error("Invalid Admin Security Secret.");
    }

    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl =
        process.env.VITE_SUPABASE_URL || "https://dqpbbzsxfwbozqcguwux.supabase.co";
      const supabaseAnonKey =
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

      const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
        realtime: { transport: ws as any },
      });

      // 2. Check if an Admin account ALREADY exists in the database
      const { data: existingAdminRoles } = await (client as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const existingAdminId = (existingAdminRoles as any[])?.[0]?.user_id;

      // 3. Register user via Supabase Auth signUp method
      const { data: signUpData, error: signUpError } = await client.auth.signUp({
        email: cleanEmail,
        password: data.password,
        options: {
          data: { fullname: data.fullname, role: "admin" },
        },
      });

      let targetUserId: string | null = (signUpData as any)?.user?.id ?? null;

      if (signUpError) {
        console.error("[Supabase Auth Registration Error Log]", signUpError);
        const errTxt = signUpError.message.toLowerCase();

        if (errTxt.includes("user already registered") || errTxt.includes("already exists")) {
          const { data: signInData } = await client.auth.signInWithPassword({
            email: cleanEmail,
            password: data.password,
          });
          if (signInData?.user?.id) {
            targetUserId = signInData.user.id;
          }
        }

        if (
          errTxt.includes("confirmation email") ||
          errTxt.includes("smtp") ||
          errTxt.includes("email")
        ) {
          if ((signUpData as any)?.user?.id) {
            targetUserId = (signUpData as any).user.id;
          } else {
            const { data: signInData } = await client.auth.signInWithPassword({
              email: cleanEmail,
              password: data.password,
            });
            if (signInData?.user?.id) {
              targetUserId = signInData.user.id;
            }
          }
        }
      }

      // 4. Resolve targetUserId via profiles table fallback if needed
      if (!targetUserId) {
        const { data: prof } = await (client as any)
          .from("profiles")
          .select("id")
          .eq("email", cleanEmail)
          .maybeSingle();
        if (prof?.id) {
          targetUserId = prof.id;
        }
      }

      const resolvedUserId = targetUserId || `admin-${Date.now()}`;

      // Enforce Single Admin Limit: Rejects registration if another Admin account already exists
      if (existingAdminId && resolvedUserId && existingAdminId !== resolvedUserId) {
        throw new Error("An administrator account already exists. Only one administrator is allowed.");
      }

      // 5. Promote resolved user to single admin role in user_roles table
      try {
        if (targetUserId) {
          const { data: existingRoles } = await (client as any)
            .from("user_roles")
            .select("id")
            .eq("user_id", targetUserId);

          if (existingRoles && existingRoles.length > 0) {
            await (client as any)
              .from("user_roles")
              .update({ role: "admin" })
              .eq("user_id", targetUserId);
          } else {
            await (client as any).from("user_roles").insert({
              user_id: targetUserId,
              role: "admin",
            });
          }

          await (client as any).from("profiles").upsert({
            id: targetUserId,
            fullname: data.fullname,
            email: cleanEmail,
          });
        }
      } catch (dbError: any) {
        console.warn("[Database Admin Profile Creation Warning]", dbError);
      }

      return {
        success: true,
        user: {
          id: resolvedUserId,
          email: cleanEmail,
          fullname: data.fullname,
        },
      };
    } catch (err: any) {
      console.error("[Admin Registration Dev Error]", err);
      throw new Error(err.message || "Failed to register admin account.");
    }
  });

export const adminSignInServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email("Please enter a valid email address."),
      password: z.string().min(6, "Password must be at least 6 characters."),
    })
  )
  .handler(async ({ data }) => {
    const cleanEmail = data.email.trim().toLowerCase();

    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl =
        process.env.VITE_SUPABASE_URL || "https://dqpbbzsxfwbozqcguwux.supabase.co";
      const supabaseAnonKey =
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

      const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
        realtime: { transport: ws as any },
      });

      const { data: authData, error: authError } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: data.password,
      });

      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes("invalid login credentials")) {
          throw new Error("Invalid email or password.");
        }
      }

      if (!authData?.user) {
        throw new Error("Invalid email or password.");
      }

      // Check existing admin in user_roles
      const { data: existingAdminRoles } = await (client as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const existingAdminId = (existingAdminRoles as any[])?.[0]?.user_id;

      if (existingAdminId && existingAdminId !== authData.user.id) {
        throw new Error("Access denied. Unauthorized admin account.");
      }

      // Promote to admin if no admin role exists yet
      if (!existingAdminId) {
        await (client as any).from("user_roles").upsert({
          user_id: authData.user.id,
          role: "admin",
        });
      }

      return {
        success: true,
        user: {
          id: authData.user.id,
          email: cleanEmail,
        },
      };
    } catch (err: any) {
      console.error("[Admin SignIn Dev Log - Error]", err);
      const msg = err.message || "";
      if (msg.includes("Invalid login credentials")) {
        throw new Error("Invalid email or password.");
      }
      throw new Error(msg || "An unexpected error occurred during login.");
    }
  });
