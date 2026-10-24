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
 * Accurately determines the customer's chosen stay type for a booking (especially for Cottages).
 * Correctly distinguishes between "day_use" and "overnight" without false positive matches.
 */
export function getBookingStayType(b: {
  stay_type?: string | null;
  overnight_fee?: number | string | null;
  special_requests?: string | null;
  room?: { type?: string | null } | null;
  rooms?: { type?: string | null } | null;
}): "day_use" | "overnight" | null {
  if (!b) return null;
  const roomType = (b.room?.type || b.rooms?.type || "").toLowerCase();
  const isCottage = roomType === "cottage";
  if (!isCottage) return null;

  // 1. Check explicit stay_type column value
  const rawStay = String(b.stay_type || "").trim().toLowerCase();
  if (rawStay === "day_use" || rawStay === "day use" || rawStay === "day") {
    return "day_use";
  }
  if (rawStay === "overnight" || rawStay === "overnight stay") {
    return "overnight";
  }

  // 2. Check explicit overnight_fee column
  const fee = Number(b.overnight_fee);
  if (!isNaN(fee) && fee > 0) {
    return "overnight";
  }

  // 3. Inspect special_requests
  const req = String(b.special_requests || "").toLowerCase();
  if (req) {
    // Explicit "Stay Type: Day Use" check (must take priority over mentions of "overnight cottage fee: ₱0")
    if (
      req.includes("stay type: day use") ||
      req.includes("stay type: day_use") ||
      req.includes("day use")
    ) {
      return "day_use";
    }

    // Explicit "Stay Type: Overnight" check
    if (
      req.includes("stay type: overnight") ||
      req.includes("overnight stay")
    ) {
      return "overnight";
    }

    // Explicit fee check in special_requests string
    if (
      req.includes("overnight cottage fee: ₱1,000") ||
      req.includes("overnight cottage fee: 1000") ||
      req.includes("overnight cottage fee: ₱1000")
    ) {
      return "overnight";
    }
    if (
      req.includes("overnight cottage fee: ₱0") ||
      req.includes("overnight cottage fee: 0")
    ) {
      return "day_use";
    }

    if (req.includes("overnight") && !req.includes("0 fee") && !req.includes("₱0")) {
      return "overnight";
    }
  }

  // Default for Cottages is Day Use
  return "day_use";
}

/**
 * Returns true if the booking is a Cottage with Overnight Stay.
 */
export function isOvernightCottage(b: {
  stay_type?: string | null;
  overnight_fee?: number | string | null;
  special_requests?: string | null;
  room?: { type?: string | null } | null;
  rooms?: { type?: string | null } | null;
}): boolean {
  if (!b) return false;
  const roomType = (b.room?.type || b.rooms?.type || "").toLowerCase();
  if (roomType !== "cottage") return false;
  return getBookingStayType(b) === "overnight";
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
    const isDayUse = isCottage && getBookingStayType(b) === "day_use";

    const checkInDate = String(b.check_in).trim();
    const checkOutDate = String(b.check_out).trim();

    let newStatus: "completed" | "no-show" | null = null;

    // ========================================================
    // RULE 1: AUTOMATIC "completed"
    // ========================================================
    // Check-out date has passed in Philippine time (Asia/Manila, UTC+08:00).
    // The booking becomes Completed strictly after the checkout date has ended (checkOutDate < today).
    // Guests whose checkout date is TODAY remain active until the checkout date has ended.
    // Stays are updated to Completed regardless of whether paid or unpaid, while payment status is fully preserved.
    if (checkOutDate < today) {
      newStatus = "completed";
    }

    // ========================================================
    // RULE 2: AUTOMATIC "no-show" (Exceeded check-in window for ongoing stays)
    // ========================================================
    // Only applies if the reservation checkout has not passed (checkOutDate >= today):
    // - Check-in date passed without guest arriving/paying
    // - Check-in date is today and exceeded 5-hour check-in window
    if (!newStatus && checkOutDate >= today) {
      const fiveHourThreshold = isDayUse ? 13 : 19;

      // Case 2A: Check-in date has passed (yesterday or earlier) and booking was unpaid
      if ((b.status === "pending" || b.status === "approved") && checkInDate < today && isUnpaid) {
        newStatus = "no-show";
      }
      // Case 2B: Check-in date is TODAY, and guest has exceeded the check-in time by 5 hours
      else if ((b.status === "pending" || b.status === "approved") && checkInDate === today && currentHour >= fiveHourThreshold) {
        if (isUnpaid || isDayUse) {
          newStatus = "no-show";
        }
      }
    }

    // If status changed, update database and in-memory object
    if (newStatus) {
      try {
        const updatePayload: Record<string, any> = { status: newStatus };
        if ("booking_status" in b) {
          updatePayload.booking_status = newStatus;
        }
        if (newStatus === "no-show") {
          updatePayload.cancelled_by = "System";
          updatePayload.cancelled_by_name = "Automated System";
          updatePayload.cancellation_reason = "Automatically marked as No-Show due to exceeded check-in policy hour";
          updatePayload.cancelled_at = new Date().toISOString();
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
