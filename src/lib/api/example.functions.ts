import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

export const getGreeting = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const config = getServerConfig();
    return {
      greeting: `Hello, ${data.name}!`,
      mode: config.nodeEnv ?? "unknown",
    };
  });

export const makeAdmin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await (supabaseAdmin as any).from("user_roles").insert({
        user_id: data.userId,
        role: "admin",
      });
      if (error) {
        throw new Error(error.message);
      }
      return { success: true };
    } catch (err: any) {
      console.error("Failed to make user admin:", err);
      throw new Error(err.message || "Failed to make user admin");
    }
  });
