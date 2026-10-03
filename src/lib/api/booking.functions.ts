import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import ws from "ws";

if (typeof window === "undefined" && typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = ws;
}

// ─── Helper: create a server-side Supabase client ─────────────────────────────
async function getServerSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || "https://dqpbbzsxfwbozqcguwux.supabase.co";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: ws as any },
  });
}

// ─── Fetch all bookings for a room (for calendar display) ─────────────────────
export const getRoomBookingsServerFn = createServerFn({ method: "GET" })
  .validator(z.object({ roomId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const client = await getServerSupabase();
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

// ─── Check for booking conflicts (server-side validation) ─────────────────────
export const checkBookingConflictServerFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      roomId: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
    })
  )
  .handler(async ({ data }) => {
    try {
      const client = await getServerSupabase();
      const { data: result, error } = await client.rpc(
        "check_booking_conflict" as any,
        {
          p_room_id: data.roomId,
          p_check_in: data.checkIn,
          p_check_out: data.checkOut,
        }
      );

      if (error) {
        // If RPC doesn't exist yet, fall back to a direct query
        console.warn("check_booking_conflict RPC not found, falling back to direct query:", error);
        const { data: conflicts } = await client
          .from("bookings")
          .select("id")
          .eq("room_id", data.roomId)
          .is("deleted_at", null)
          .not("status", "in", '("cancelled","rejected")')
          .lte("check_in", data.checkOut)
          .gte("check_out", data.checkIn)
          .limit(1);
        return { hasConflict: (conflicts?.length ?? 0) > 0 };
      }

      return { hasConflict: !!result };
    } catch (e) {
      console.error("checkBookingConflictServerFn error:", e);
      return { hasConflict: false };
    }
  });

// ─── Atomic insert: only inserts if no conflict (prevents double booking) ─────
export const insertBookingIfAvailableServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      userId: z.string(),
      roomId: z.string(),
      guestName: z.string(),
      guestEmail: z.string(),
      guestPhone: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      guests: z.number(),
      totalAmount: z.number(),
      specialRequests: z.string().nullable(),
      stayType: z.string().nullable().optional(),
      overnightFee: z.number().optional(),
    })
  )
  .handler(async ({ data }) => {
    try {
      const client = await getServerSupabase();

      // Try the atomic RPC first
      const { data: result, error: rpcError } = await client.rpc(
        "insert_booking_if_available" as any,
        {
          p_user_id: data.userId,
          p_room_id: data.roomId,
          p_guest_name: data.guestName,
          p_guest_email: data.guestEmail,
          p_guest_phone: data.guestPhone,
          p_check_in: data.checkIn,
          p_check_out: data.checkOut,
          p_guests: data.guests,
          p_total_amount: data.totalAmount,
          p_special_requests: data.specialRequests,
          p_stay_type: data.stayType ?? null,
          p_overnight_fee: data.overnightFee ?? 0,
        }
      );

      if (!rpcError && result) {
        const parsed = typeof result === "string" ? JSON.parse(result) : result;
        return parsed;
      }

      // Fallback: manual conflict check + insert if RPC unavailable
      console.warn("insert_booking_if_available RPC not available, falling back:", rpcError);

      const { data: conflicts } = await client
        .from("bookings")
        .select("id")
        .eq("room_id", data.roomId)
        .is("deleted_at", null)
        .not("status", "in", '("cancelled","rejected")')
        .lte("check_in", data.checkOut)
        .gte("check_out", data.checkIn)
        .limit(1);

      if (conflicts && conflicts.length > 0) {
        return {
          success: false,
          error: "This slot has already been booked and is no longer available.",
        };
      }

      const insertPayload: any = {
        user_id: data.userId,
        room_id: data.roomId,
        guest_name: data.guestName,
        guest_email: data.guestEmail,
        guest_phone: data.guestPhone,
        check_in: data.checkIn,
        check_out: data.checkOut,
        guests: data.guests,
        total_amount: data.totalAmount,
        special_requests: data.specialRequests,
        status: "approved",
        stay_type: data.stayType ?? null,
        overnight_fee: data.overnightFee ?? 0,
      };

      const { data: newBooking, error: insertError } = await client
        .from("bookings")
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        // Retry without optional columns if schema mismatch
        if (
          insertError.message?.includes("stay_type") ||
          insertError.message?.includes("overnight_fee")
        ) {
          delete insertPayload.stay_type;
          delete insertPayload.overnight_fee;
          const { data: retryBooking, error: retryError } = await client
            .from("bookings")
            .insert(insertPayload)
            .select()
            .single();
          if (retryError) return { success: false, error: retryError.message };
          return { success: true, booking: retryBooking };
        }
        return { success: false, error: insertError.message };
      }

      return { success: true, booking: newBooking };
    } catch (e: any) {
      console.error("insertBookingIfAvailableServerFn error:", e);
      return { success: false, error: e.message || "An unexpected error occurred." };
    }
  });
