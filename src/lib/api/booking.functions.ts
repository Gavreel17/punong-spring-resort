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
      phone: z.string().optional(),
      singleFoamBeds: z.number().default(0),
      doubleFoamBeds: z.number().default(0),
    })
  )
  .handler(async ({ data }) => {
    try {
      if (data.phone !== undefined) {
        const rawPhone = (data.phone || "").trim();
        if (!rawPhone) {
          return { valid: false, error: "Mobile number is required." };
        }
        if (/\D/.test(rawPhone)) {
          return { valid: false, error: "Only numeric digits are allowed." };
        }
        if (!rawPhone.startsWith("09")) {
          return {
            valid: false,
            error: "Please enter a valid Philippine mobile number starting with 09.",
          };
        }
        if (rawPhone.length !== 11) {
          return {
            valid: false,
            error: "Mobile number must contain exactly 11 digits.",
          };
        }
        if (!/^09[0-9]{9}$/.test(rawPhone)) {
          return {
            valid: false,
            error: "Please enter a valid Philippine mobile number starting with 09.",
          };
        }
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
      accessToken: z.string().optional(),
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
        process.env.VITE_SUPABASE_URL ||
        process.env.SUPABASE_URL ||
        "https://dqpbbzsxfwbozqcguwux.supabase.co";
      const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

      const clientOptions: any = {
        auth: { persistSession: false },
        realtime: { transport: ws as any },
      };

      if (data.accessToken) {
        clientOptions.global = {
          headers: {
            Authorization: `Bearer ${data.accessToken}`,
          },
        };
      }

      const client = createClient(supabaseUrl, supabaseKey, clientOptions);

      // 1. Fetch booking with payments
      const { data: booking, error: bErr } = await client
        .from("bookings")
        .select("id, user_id, status, check_in, check_out, total_amount, guest_name, payments(id, amount, status, notes)")
        .eq("id", data.bookingId)
        .maybeSingle();

      if (bErr) {
        console.warn("[cancelBookingCustomerServerFn] Booking fetch error:", bErr.message);
      }

      if (!booking) {
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

      // 4. Completed verification: Only completed bookings cannot be cancelled
      if (status === "completed" || status === "checked-out") {
        return {
          success: false,
          error: "Cancellation Unavailable. This reservation has already been completed and can no longer be cancelled.",
        };
      }

      // 5. Update booking status to cancelled
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

/**
 * Server-side automatic booking completion based on Philippine Time (Asia/Manila, UTC+08:00)
 */
export async function autoCompleteBookingsOnServer() {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "https://dqpbbzsxfwbozqcguwux.supabase.co";
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

    const client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { transport: ws as any },
    });

    const now = new Date();
    const todayPh = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    // Fetch active bookings whose checkout date has passed in Philippine time
    // Exclude bookings that are already completed, cancelled, rejected, or no-show
    const { data: pastBookings, error: fetchErr } = await client
      .from("bookings")
      .select("id, check_in, check_out, status")
      .lt("check_out", todayPh)
      .in("status", ["pending", "approved"])
      .is("deleted_at", null);

    if (fetchErr) {
      console.warn("[autoCompleteBookingsOnServer] Fetch error:", fetchErr.message);
      return { success: false, error: fetchErr.message, count: 0, todayPh };
    }

    if (!pastBookings || pastBookings.length === 0) {
      return { success: true, count: 0, updatedIds: [], todayPh };
    }

    const updatedIds: string[] = [];
    for (const b of pastBookings) {
      const { error: updErr } = await client
        .from("bookings")
        .update({ status: "completed" })
        .eq("id", b.id);

      if (!updErr) {
        updatedIds.push(b.id);
      } else {
        console.warn(`[autoCompleteBookingsOnServer] Failed to complete booking ${b.id}:`, updErr.message);
      }
    }

    if (updatedIds.length > 0) {
      console.log(`[autoCompleteBookingsOnServer] Automatically completed ${updatedIds.length} past booking(s) on Philippine date ${todayPh}`);
    }

    return {
      success: true,
      count: updatedIds.length,
      updatedIds,
      todayPh,
    };
  } catch (err: any) {
    console.error("[autoCompleteBookingsOnServer] Execution error:", err);
    return { success: false, error: err?.message || "Server auto-completion failed", count: 0 };
  }
}

/**
 * Server function callable by client components and API requests to trigger automatic booking completion
 */
export const autoCompleteBookingsServerFn = createServerFn({ method: "POST" })
  .handler(async () => {
    return await autoCompleteBookingsOnServer();
  });

/**
 * Server function for undoing payment:
 * STRICT BUSINESS RULE: Rejects undo payment if the reservation is already Completed.
 */
export const undoPaymentServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bookingId: z.string(),
      paymentId: z.string(),
      adminId: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.SUPABASE_URL ||
        "https://dqpbbzsxfwbozqcguwux.supabase.co";
      const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

      const client = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        realtime: { transport: ws as any },
      });

      // 1. Fetch target booking
      const { data: booking, error: bErr } = await client
        .from("bookings")
        .select("id, status, check_out, guest_name")
        .eq("id", data.bookingId)
        .maybeSingle();

      if (bErr || !booking) {
        return { success: false, error: "Reservation booking record not found." };
      }

      const now = new Date();
      const todayPh = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
      const checkOutDate = String(booking.check_out || "").split("T")[0].trim();

      // If checkout date has passed in Philippine time, ensure it is completed
      if (checkOutDate && checkOutDate < todayPh && booking.status !== "completed") {
        await client.from("bookings").update({ status: "completed" }).eq("id", booking.id);
        booking.status = "completed";
      }

      // STRICT BACKEND ENFORCEMENT:
      // "Once a booking's status is Completed, the admin must not be able to undo, reverse, or reset its payment through the normal booking interface.
      // Enforce the restriction in the backend, not just by hiding the button.
      // Reject direct API requests attempting to undo payment for a completed booking.
      // Display a clear message if a blocked action is attempted:
      // 'Payment cannot be undone because this booking is already completed.'"
      if (booking.status === "completed") {
        return {
          success: false,
          error: "Payment cannot be undone because this booking is already completed.",
        };
      }

      // 2. Fetch payment record
      const { data: payment, error: pFetchErr } = await client
        .from("payments")
        .select("id, status, amount")
        .eq("id", data.paymentId)
        .maybeSingle();

      if (pFetchErr || !payment) {
        return { success: false, error: "Payment record not found." };
      }

      const previousStatus = payment.status;

      // 3. Revert payment status to unpaid
      const { error: pUpdErr } = await client
        .from("payments")
        .update({ status: "unpaid" })
        .eq("id", data.paymentId);

      if (pUpdErr) {
        return { success: false, error: pUpdErr.message };
      }

      // 4. Log in payment_audit_logs table if available
      try {
        let adminName = "Admin";
        if (data.adminId) {
          const { data: profile } = await client
            .from("profiles")
            .select("fullname")
            .eq("id", data.adminId)
            .maybeSingle();
          if (profile?.fullname) adminName = profile.fullname;
        }

        await client.from("payment_audit_logs").insert({
          payment_id: data.paymentId,
          booking_id: data.bookingId,
          admin_id: data.adminId || null,
          admin_name: adminName,
          previous_status: previousStatus,
          new_status: "unpaid",
        });
      } catch (auditErr) {
        console.warn("Payment audit log insert error (non-fatal):", auditErr);
      }

      return {
        success: true,
        message: "Payment status has been reverted to Unpaid.",
      };
    } catch (err: any) {
      console.error("undoPaymentServerFn error:", err);
      return { success: false, error: err?.message || "Failed to process payment reversal on server." };
    }
  });

/**
 * Server-side room availability check to prevent double booking.
 * Uses database-level query to detect conflicting bookings for walk-in / direct reservations.
 *
 * Overlap condition:  new_check_in < existing_check_out AND new_check_out > existing_check_in
 * Statuses that BLOCK inventory: pending, approved, verified, confirmed, checked-in
 * Statuses that DO NOT block: cancelled, rejected, no-show, completed
 */
export const checkRoomAvailabilityServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      roomId: z.string(),
      checkIn: z.string(),   // YYYY-MM-DD
      checkOut: z.string(),  // YYYY-MM-DD
      excludeBookingId: z.string().optional(), // For edit mode: exclude the booking being edited
    })
  )
  .handler(async ({ data }) => {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.SUPABASE_URL ||
        "https://dqpbbzsxfwbozqcguwux.supabase.co";
      const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

      const client = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        realtime: { transport: ws as any },
      });

      // Validate date inputs
      if (!data.checkIn || !data.checkOut || !data.roomId) {
        return { available: false, error: "Room ID, check-in, and check-out dates are required." };
      }

      if (data.checkIn >= data.checkOut) {
        return { available: false, error: "Check-out date must be after check-in date." };
      }

      // Statuses that block inventory in PostgreSQL enum 'booking_status':
      // The enum values in the database are: 'pending', 'approved', 'rejected', 'cancelled', 'completed', 'no-show'
      // Active reservations that hold inventory are strictly 'pending' and 'approved'.
      const BLOCKING_STATUSES = ["pending", "approved"];

      // 1. Check resort-wide blocks
      try {
        const { data: blocks } = await client
          .from("resort_blocks" as any)
          .select("id, start_date, end_date, reason")
          .lte("start_date", data.checkOut)
          .gte("end_date", data.checkIn);

        if (blocks && blocks.length > 0) {
          const blk = blocks[0];
          return {
            available: false,
            conflicts: [
              {
                id: blk.id,
                guestName: blk.reason || "Resort Blocked",
                checkIn: blk.start_date,
                checkOut: blk.end_date,
                status: "Resort Closed",
              },
            ],
          };
        }
      } catch (e) {
        // resort_blocks table check non-fatal
      }

      // 2. Check room-specific maintenance
      try {
        const { data: roomInfo } = await client
          .from("rooms")
          .select("id, name, status, maintenance_start, maintenance_end")
          .eq("id", data.roomId)
          .maybeSingle();

        if (roomInfo) {
          const isUnderMaint =
            roomInfo.status === "maintenance" &&
            (!roomInfo.maintenance_start || !roomInfo.maintenance_end);
          const overlapsMaint =
            roomInfo.maintenance_start &&
            roomInfo.maintenance_end &&
            data.checkIn < roomInfo.maintenance_end &&
            data.checkOut > roomInfo.maintenance_start;

          if (isUnderMaint || overlapsMaint) {
            return {
              available: false,
              conflicts: [
                {
                  id: "maintenance-" + roomInfo.id,
                  guestName: "Facility Maintenance",
                  checkIn: roomInfo.maintenance_start || data.checkIn,
                  checkOut: roomInfo.maintenance_end || data.checkOut,
                  status: "Under Maintenance",
                },
              ],
            };
          }
        }
      } catch (e) {
        // rooms maintenance check non-fatal
      }

      // 3. Query conflicting active bookings using date-overlap formula:
      // new_check_in < existing_check_out AND new_check_out > existing_check_in
      let query = client
        .from("bookings")
        .select("id, guest_name, check_in, check_out, status")
        .eq("room_id", data.roomId)
        .is("deleted_at", null)
        .in("status", BLOCKING_STATUSES)
        .lt("check_in", data.checkOut)
        .gt("check_out", data.checkIn);

      // Exclude existing booking when editing
      if (data.excludeBookingId) {
        query = query.neq("id", data.excludeBookingId);
      }

      const { data: conflicts, error: qErr } = await query;

      if (qErr) {
        console.error("[checkRoomAvailabilityServerFn] DB error:", qErr.message);
        return {
          available: false,
          error: `Database check failed: ${qErr.message}. Cannot save reservation until availability is confirmed.`,
          dbError: true,
        };
      }

      if (!conflicts || conflicts.length === 0) {
        return { available: true, conflicts: [] };
      }

      // Return conflict details to surface in UI
      return {
        available: false,
        conflicts: conflicts.map((c) => ({
          id: c.id,
          guestName: c.guest_name || "Another Guest",
          checkIn: c.check_in,
          checkOut: c.check_out,
          status: c.status,
        })),
      };
    } catch (err: any) {
      console.error("[checkRoomAvailabilityServerFn] error:", err);
      return {
        available: false,
        error: err?.message || "Failed to verify availability on server.",
        dbError: true,
      };
    }
  });

