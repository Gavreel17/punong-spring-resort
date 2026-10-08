import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import ws from "ws";

if (typeof window === "undefined" && typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = ws;
}

export const getRoomBookingsServerFn = createServerFn({ method: "GET" })
  .validator(z.object({ roomId: z.string() }))
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
        (b: any) => b.status !== "cancelled" && b.status !== "rejected" && b.status !== "no-show"
      );
    } catch (e) {
      console.error("getRoomBookingsServerFn error:", e);
      return [];
    }
  });

export const validateBookingRequirementsServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      roomId: z.string(),
      guests: z.number(),
      singleFoamBeds: z.number().default(0),
      doubleFoamBeds: z.number().default(0),
    })
  )
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

      const { data: room, error } = await client
        .from("rooms")
        .select("id, type, capacity")
        .eq("id", data.roomId)
        .single();

      if (error || !room) {
        return { valid: false, error: "Accommodation not found." };
      }

      const isRoomCategory = room.type === "room";
      const isUnlimited = String(room.capacity || "").toLowerCase().includes("unlimited");
      const nums = String(room.capacity || "").match(/\d+/g);
      const maxCapacity = nums && nums.length > 0 && !isUnlimited ? Math.max(...nums.map(Number)) : undefined;

      if (!isRoomCategory) {
        // Non-room categories (cottage, villa/function hall): strict capacity limit
        if (!isUnlimited && maxCapacity !== undefined && data.guests > maxCapacity) {
          const typeName = room.type === "villa" ? "Function Hall" : room.type || "accommodation";
          return {
            valid: false,
            error: `Number of guests (${data.guests}) exceeds the maximum capacity of ${maxCapacity} guests for this ${typeName}.`,
          };
        }
      } else {
        // Room category: allow over-capacity, but MUST have sufficient extra beds
        const regularIncluded = isUnlimited ? Infinity : (maxCapacity || 6);
        const extraPersons = isUnlimited || maxCapacity === undefined ? 0 : Math.max(0, data.guests - regularIncluded);
        // Bed capacities: Single Foam Bed = 1 person, Double Foam Bed = 2 persons
        const extraBedCapacity = (data.singleFoamBeds * 1) + (data.doubleFoamBeds * 2);

        if (extraPersons > 0 && extraBedCapacity < extraPersons) {
          const deficit = extraPersons - extraBedCapacity;
          const msg = extraBedCapacity === 0
            ? `This room accommodates ${regularIncluded} guests. You have added ${extraPersons} extra person${extraPersons > 1 ? "s" : ""}. Please select an extra bed type and quantity before continuing.`
            : `This room accommodates ${regularIncluded} guests. You have added ${extraPersons} extra person${extraPersons > 1 ? "s" : ""}, but your selected extra beds only accommodate ${extraBedCapacity} person${extraBedCapacity > 1 ? "s" : ""}. Please add ${deficit} more bed slot${deficit > 1 ? "s" : ""} before continuing.`;
          return { valid: false, error: msg };
        }
      }

      return { valid: true };
    } catch (e: any) {
      console.error("validateBookingRequirementsServerFn error:", e);
      return { valid: false, error: e?.message || "Failed to validate booking on server." };
    }
  });

export const cancelBookingCustomerServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bookingId: z.string(),
      userId: z.string(),
      cancellationReason: z.string(),
    })
  )
  .handler(async ({ data }) => {
    try {
      if (!data.userId || !data.bookingId) {
        return { success: false, error: "Authentication and reservation ID are required." };
      }
      const reason = data.cancellationReason?.trim();
      if (!reason) {
        return { success: false, error: "Please select or provide a cancellation reason." };
      }

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

      // 1. Fetch booking with payments
      const { data: booking, error: bErr } = await client
        .from("bookings")
        .select("id, user_id, status, check_in, check_out, total_amount, guest_name, deleted_at, payments(id, amount, status, notes)")
        .eq("id", data.bookingId)
        .is("deleted_at", null)
        .maybeSingle();

      if (bErr || !booking) {
        return { success: false, error: "Reservation not found or has been removed." };
      }

      // 2. Ownership verification
      if (booking.user_id !== data.userId) {
        return { success: false, error: "Unauthorized: You can only cancel your own reservations." };
      }

      const status = (booking.status || "").toLowerCase();

      // 3. Already cancelled verification
      if (status === "cancelled" || status === "rejected") {
        return { success: false, error: "This reservation has already been cancelled." };
      }

      // 4. Completed or checked-out verification
      if (status === "completed" || status === "checked-out" || status === "no-show") {
        return {
          success: false,
          error: "Cancellation Unavailable. This reservation has already been completed or has reached its check-out date and can no longer be cancelled.",
        };
      }

      // 5. Date validation in Asia/Manila timezone (resort-local time)
      const now = new Date();
      const todayManila = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

      if (booking.check_out && todayManila >= booking.check_out) {
        return {
          success: false,
          error: "Cancellation Unavailable. This reservation has already been completed or has reached its check-out date and can no longer be cancelled.",
        };
      }

      // 6. Update booking status to cancelled
      const { error: updErr } = await client
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id);

      if (updErr) {
        return { success: false, error: updErr.message };
      }

      // 7. Record cancellation reason and date
      const payment = booking.payments?.[0];
      const nowIso = new Date().toISOString();
      if (payment?.id) {
        let parsedNotes: any = {};
        try { parsedNotes = JSON.parse(payment.notes || "{}"); } catch(e){}
        parsedNotes.cancellation_reason = reason;
        parsedNotes.cancellation_date = nowIso;
        parsedNotes.cancelled_by = "Customer";
        parsedNotes.cancelled_by_name = booking.guest_name || "Customer";

        let newPaymentStatus = payment.status;
        if (parsedNotes.method === "resort") {
          newPaymentStatus = "unpaid";
        }

        await client
          .from("payments")
          .update({
            status: newPaymentStatus,
            notes: JSON.stringify(parsedNotes),
          })
          .eq("id", payment.id);
      } else {
        const notesPayload = JSON.stringify({
          method: "resort",
          cancellation_reason: reason,
          cancellation_date: nowIso,
          cancelled_by: "Customer",
          cancelled_by_name: booking.guest_name || "Customer",
        });
        await client.from("payments").insert({
          booking_id: booking.id,
          user_id: data.userId,
          amount: 0,
          status: "unpaid",
          notes: notesPayload,
        });
      }

      return { success: true, message: "Booking cancelled successfully." };
    } catch (err: any) {
      console.error("cancelBookingCustomerServerFn error:", err);
      return { success: false, error: err?.message || "Failed to cancel booking on server." };
    }
  });

