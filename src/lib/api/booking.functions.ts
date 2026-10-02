import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import ws from "ws";

if (typeof window === "undefined" && typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = ws;
}

export const getRoomBookingsServerFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ roomId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl =
        process.env.VITE_SUPABASE_URL || "https://dqpbbzsxfwbozqcguwux.supabase.co";
      const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

      const client = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        realtime: { transport: ws as any },
      });

      const { data: bookingsData, error } = await client
        .from("bookings")
        .select("id, room_id, check_in, check_out, status, deleted_at")
        .eq("room_id", data.roomId)
        .is("deleted_at", null);

      if (error) {
        console.warn("getRoomBookingsServerFn query error:", error);
        return [];
      }

      return (bookingsData || []).filter(
        (b: any) => b.status !== "cancelled" && b.status !== "rejected"
      );
    } catch (e) {
      console.error("getRoomBookingsServerFn error:", e);
      return [];
    }
  });
