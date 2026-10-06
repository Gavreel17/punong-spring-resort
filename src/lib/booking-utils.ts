import { supabase } from "@/integrations/supabase/client";

/**
 * Returns current date and time in the Philippine timezone (Asia/Manila, UTC+8)
 */
export function getPhilippineTime(): {
  dateStr: string; // "YYYY-MM-DD"
  hour: number;    // 0 - 23 (e.g., 12 for 12 PM, 14 for 2 PM, 18 for 6 PM)
  minute: number;  // 0 - 59
  timeStr: string; // "HH:MM"
} {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const timeStr = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour12: false });
  const [hourStr, minStr] = timeStr.split(":");
  const hour = parseInt(hourStr || "0", 10);
  const minute = parseInt(minStr || "0", 10);

  return {
    dateStr,
    hour,
    minute,
    timeStr: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/**
 * Automatically updates booking statuses based on Resort Policy Hours:
 * 
 * RESORT POLICY HOURS:
 * - Standard Check-In: Starts at 2:00 PM (14:00).
 * - Resort Office / Gate Closing Policy Hour: 6:00 PM (18:00).
 * - Standard Check-Out: By 12:00 PM (12:00 noon) for overnight cottages, rooms, and function halls.
 * - Day-Use Cottage Hours: 8:00 AM until 6:00 PM (18:00).
 * 
 * 1. AUTOMATIC "completed":
 *    - For approved/confirmed or verified paid bookings:
 *      a) Check-out date is in the past (check_out < today).
 *      b) Check-out date is TODAY (check_out === today) AND:
 *         - Overnight stays / rooms: current time >= 12:00 PM (past checkout policy hour).
 *         - Day-use cottages: current time >= 6:00 PM (past day-use closing hour).
 * 
 * 2. AUTOMATIC "no-show":
 *    - For customer who failed to arrive/check-in according to resort policy hour:
 *      a) Check-in date is in the past (check_in < today) and booking is unpaid or unattended.
 *      b) Check-in date is TODAY (check_in === today) AND:
 *         - Current time >= 6:00 PM (past resort check-in closing policy hour) and booking is unpaid/pending.
 *         - For Day-Use Cottage: current time >= 6:00 PM and booking was unpaid or unattended.
 *      c) Entire reservation schedule has passed (check_out < today) and booking remained pending.
 */
export async function processAutoBookingStatuses(bookings?: any[]): Promise<boolean> {
  const { dateStr: today, hour: currentHour } = getPhilippineTime();
  let updatedAny = false;

  let targetBookings: any[] = [];

  if (bookings && Array.isArray(bookings) && bookings.length > 0) {
    targetBookings = bookings;
  } else {
    // If no bookings provided, automatically query all active pending/approved bookings from Supabase
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          check_in,
          check_out,
          status,
          booking_status,
          stay_type,
          special_requests,
          total_amount,
          room_id,
          room:rooms(id, name, type),
          payments(id, amount, status)
        `)
        .in("status", ["pending", "approved"])
        .is("deleted_at", null);

      if (!error && data) {
        targetBookings = data;
      }
    } catch (e) {
      console.warn("Failed to fetch bookings for auto status evaluation:", e);
      return false;
    }
  }

  if (!targetBookings || targetBookings.length === 0) return false;

  for (const b of targetBookings) {
    if (!b || !b.id || !b.check_in || !b.check_out) continue;
    if (b.status === "cancelled" || b.status === "rejected" || b.status === "completed" || b.status === "no-show") {
      continue;
    }

    const paymentsList = b.payments || [];
    const isPaid = paymentsList.some((p: any) => p.status === "verified" || p.status === "paid");
    const isUnpaid = !isPaid;

    const roomType = (b.room?.type || b.rooms?.type || "").toLowerCase();
    const isCottage = roomType === "cottage";
    const rawStay = (b.stay_type || b.special_requests || "").toLowerCase();
    const isDayUse = isCottage && (rawStay.includes("day use") || rawStay.includes("day_use") || !rawStay.includes("overnight"));

    const checkInDate = String(b.check_in).trim();
    const checkOutDate = String(b.check_out).trim();

    let newStatus: "completed" | "no-show" | null = null;

    // ========================================================
    // RULE 1: AUTOMATIC "completed"
    // ========================================================
    // Case 1A: Check-out date is already past
    if ((b.status === "approved" || isPaid) && checkOutDate < today) {
      newStatus = "completed";
    }
    // Case 1B: Check-out date is TODAY and check-out policy hour has passed
    else if ((b.status === "approved" || isPaid) && checkOutDate === today) {
      if (isDayUse && currentHour >= 18) {
        // Day Use cottage ends at 6:00 PM (18:00)
        newStatus = "completed";
      } else if (!isDayUse && currentHour >= 12) {
        // Standard check-out policy hour is 12:00 PM (12:00)
        newStatus = "completed";
      }
    }

    // ========================================================
    // RULE 2: AUTOMATIC "no-show" (Exceeded 5-hour check-in window)
    // ========================================================
    // When a customer exceeds the scheduled check-in window by 5 hours:
    // - Day-use cottage (check-in at 8:00 AM): 5 hours past is 1:00 PM (13:00)
    // - Overnight stay/room (check-in at 2:00 PM): 5 hours past is 7:00 PM (19:00)
    // - Once marked as "no-show", the booking is released and the room automatically becomes available
    if (!newStatus) {
      const fiveHourThreshold = isDayUse ? 13 : 19;

      // Case 2A: Check-in date has passed (yesterday or earlier) and booking was unpaid or guest never arrived
      if ((b.status === "pending" || b.status === "approved") && checkInDate < today && isUnpaid) {
        newStatus = "no-show";
      }
      // Case 2B: Check-in date is TODAY, and guest has exceeded the check-in time by 5 hours
      else if ((b.status === "pending" || b.status === "approved") && checkInDate === today && currentHour >= fiveHourThreshold) {
        if (isUnpaid || isDayUse) {
          newStatus = "no-show";
        }
      }
      // Case 2C: Entire reservation passed (check_out < today) and still pending
      else if (b.status === "pending" && checkOutDate < today) {
        newStatus = "no-show";
      }
    }

    // If status changed, update database and in-memory object
    if (newStatus) {
      try {
        const updatePayload: Record<string, any> = { status: newStatus };
        if ("booking_status" in b) {
          updatePayload.booking_status = newStatus;
        }

        const { error } = await supabase
          .from("bookings")
          .update(updatePayload)
          .eq("id", b.id);

        if (!error) {
          b.status = newStatus;
          if ("booking_status" in b) {
            b.booking_status = newStatus;
          }
          updatedAny = true;
        } else {
          console.warn(`Failed to auto-update booking ${b.id} to ${newStatus}:`, error.message);
        }
      } catch (err) {
        console.warn(`Error updating auto status for booking ${b.id}:`, err);
      }
    }
  }

  return updatedAny;
}
