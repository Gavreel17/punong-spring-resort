import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { processAutoBookingStatuses } from "@/lib/booking-utils";

/**
 * Background auto-status manager:
 * Automatically runs processAutoBookingStatuses on mount, every 60 seconds,
 * and whenever the user returns to the browser tab.
 */
export function useAutoBookingStatus() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let isCancelled = false;

    const runAutoCheck = async () => {
      try {
        const changed = await processAutoBookingStatuses();
        if (changed && !isCancelled) {
          queryClient.invalidateQueries({ queryKey: ["dashboard-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["calendar-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["customer-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["bookings"] });
          queryClient.invalidateQueries({ queryKey: ["room-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
        }
      } catch (err) {
        console.warn("Background auto status check error:", err);
      }
    };

    // 1. Initial run on mount
    runAutoCheck();

    // 2. Periodic interval every 60 seconds
    const interval = setInterval(runAutoCheck, 60000);

    // 3. Tab visibility listener (runs when returning to the tab)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        runAutoCheck();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [queryClient]);
}
