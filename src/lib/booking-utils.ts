import { supabase } from "@/integrations/supabase/client";

/**
 * Automatically updates booking statuses:
 * - Marks 'no-show' if check_in < today and payment is unpaid/pending.
 * - Marks 'completed' if check_out <= today and booking is approved or paid.
 */
export async function processAutoBookingStatuses(bookings: any[]) {
  if (!bookings || bookings.length === 0) return false;
  const today = new Date().toISOString().split("T")[0];
  let updatedAny = false;

  for (const b of bookings) {
    if (!b || b.status === "cancelled" || b.status === "rejected" || b.status === "completed" || b.status === "no-show") {
      continue;
    }

    const p = b.payments?.[0];
    const isPaid = p?.status === "verified";
    const isUnpaid = !p || p.status === "unpaid" || p.status === "pending";

    // 1. Automatic Mark No-Show: Check-in date has passed & guest hasn't shown up / unpaid
    if ((b.status === "approved" || b.status === "pending") && b.check_in < today && isUnpaid) {
      const { error } = await supabase.from("bookings").update({ status: "no-show" }).eq("id", b.id);
      if (!error) {
        b.status = "no-show";
        updatedAny = true;
      }
    }
    // 2. Automatic Mark Complete: Check-out schedule is done (check_out <= today) and booking is approved/paid
    else if ((b.status === "approved" || isPaid) && b.check_out <= today) {
      const { error } = await supabase.from("bookings").update({ status: "completed" }).eq("id", b.id);
      if (!error) {
        b.status = "completed";
        updatedAny = true;
      }
    }
  }

  return updatedAny;
}
