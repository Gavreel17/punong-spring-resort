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

// Rate-limiting tracker for password recovery requests
const resetRateLimitMap = new Map<string, number>();

export const adminRequestPasswordResetServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email("Please enter a valid email address."),
      origin: z.string().url("Valid origin URL is required."),
    })
  )
  .handler(async ({ data }) => {
    const cleanEmail = data.email.trim().toLowerCase();

    // 1. Rate-limiting check: 60-second cooldown per email
    const now = Date.now();
    const lastRequest = resetRateLimitMap.get(cleanEmail) || 0;
    const cooldownMs = 60 * 1000;
    if (now - lastRequest < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - (now - lastRequest)) / 1000);
      throw new Error(`Rate limit exceeded. Please wait ${remainingSeconds} seconds before requesting another password reset.`);
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

      // 2. Query to verify if this email belongs to an existing authorized administrator
      const { data: adminRoles } = await (client as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const adminUserIds = ((adminRoles as any[]) || []).map((r: any) => r.user_id).filter(Boolean);

      let isAuthorizedAdmin = false;

      if (adminUserIds.length > 0) {
        const { data: adminProfile } = await (client as any)
          .from("profiles")
          .select("id, email")
          .in("id", adminUserIds)
          .ilike("email", cleanEmail)
          .maybeSingle();

        if (adminProfile) {
          isAuthorizedAdmin = true;
        }
      }

      // Record rate-limit timestamp to prevent abuse
      resetRateLimitMap.set(cleanEmail, now);

      // 3. Security Rule: If NOT an authorized administrator, do NOT initiate reset or reveal existence
      if (!isAuthorizedAdmin) {
        console.warn(`[Password Reset] Non-admin or unregistered email attempted reset: ${cleanEmail}`);
        // Return generic success to avoid user/admin enumeration
        return {
          success: true,
          message: "If an authorized administrator account is associated with this email, a password reset link has been dispatched.",
        };
      }

      // 4. Send secure recovery link using Supabase Auth
      const redirectTo = `${data.origin}/admin/reset-password`;
      const { error: resetError } = await client.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      if (resetError) {
        console.error("[Password Reset Auth Error]:", resetError);
        const errMsg = resetError.message.toLowerCase();

        if (errMsg.includes("smtp") || errMsg.includes("email provider") || errMsg.includes("confirmation email") || errMsg.includes("sending")) {
          throw new Error("Email delivery could not be completed. Supabase Auth SMTP or custom email provider is not configured in your Supabase project settings.");
        }

        if (errMsg.includes("rate limit") || errMsg.includes("over_email_send_rate_limit")) {
          throw new Error("Password reset request rate limit exceeded by authentication service. Please try again in a few minutes.");
        }

        throw new Error(resetError.message || "Failed to process password reset request.");
      }

      return {
        success: true,
        message: "If an authorized administrator account is associated with this email, a password reset link has been dispatched.",
      };
    } catch (err: any) {
      console.error("[Admin Password Reset Error]:", err);
      throw new Error(err.message || "An unexpected error occurred during password recovery.");
    }
  });

export const adminVerifyAdminRoleServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().min(1, "User ID is required."),
    })
  )
  .handler(async ({ data }) => {
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

      const { data: roleData } = await (client as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .eq("role", "admin")
        .maybeSingle();

      return {
        isAdmin: !!roleData,
      };
    } catch (e) {
      return { isAdmin: false };
    }
  });

