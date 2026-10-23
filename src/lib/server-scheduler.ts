import { autoCompleteBookingsOnServer } from "./api/booking.functions";

let schedulerInitialized = false;

/**
 * Initializes a background scheduled job that evaluates and completes past bookings
 * every 60 seconds on the server, even when nobody is viewing the page.
 */
export function initServerScheduler() {
  if (typeof window !== "undefined") return; // Only run on server
  if (schedulerInitialized) return;
  schedulerInitialized = true;

  console.log("[Server Scheduler] Automatic booking completion background job registered.");

  // Execute on server boot
  setTimeout(() => {
    autoCompleteBookingsOnServer().catch((err) => {
      console.warn("[Server Scheduler] Initial booking completion check error:", err);
    });
  }, 3000);

  // Recurring job every 60 seconds
  const interval = setInterval(() => {
    autoCompleteBookingsOnServer().catch((err) => {
      console.warn("[Server Scheduler] Interval booking completion error:", err);
    });
  }, 60 * 1000);

  if (interval && typeof (interval as any).unref === "function") {
    (interval as any).unref();
  }
}
