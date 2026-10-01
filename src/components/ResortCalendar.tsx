import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { DayButton, getDefaultClassNames } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function ResortCalendar({ className, onSelect, selected, mode = "range", ...props }: any) {
  const { data } = useQuery({
    queryKey: ["global-availability"],
    queryFn: async () => {
      const [roomsRes, bookingsRes, blocksRes] = await Promise.all([
        supabase.from("rooms").select("*"),
        supabase.from("bookings").select("*"),
        (async () => {
          try {
            const { data } = await supabase.from("resort_blocks" as any).select("*");
            return { data: data || [] };
          } catch (e) {
            console.error("Failed to fetch resort_blocks:", e);
            return { data: [] };
          }
        })(),
      ]);
      return {
        rooms: roomsRes.data || [],
        bookings: bookingsRes.data || [],
        blocks: blocksRes.data || [],
      };
    },
    refetchInterval: 5000, // Real-time feel
  });

  const rooms = data?.rooms || [];
  const bookings = data?.bookings || [];
  const blocks = (data?.blocks || []) as any[];
  const totalRooms = rooms.length;

  // Helper to check how many rooms are available on a specific date
  const getAvailability = (date: Date) => {
    if (!totalRooms) return { status: "loading", availableCount: 0 };

    // Check past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return { status: "past", availableCount: 0 };

    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    // Check resort blocks
    let isBlocked = false;
    for (const block of blocks) {
      if (dateStr >= block.start_date && dateStr <= block.end_date) {
        isBlocked = true;
        break;
      }
    }
    if (isBlocked) return { status: "booked", availableCount: 0, reason: "Resort Blocked" };

    let availableByType: Record<string, number> = {};
    let totalAvailable = 0;

    rooms.forEach((r: any) => {
      const type = r.type || "room";
      if (!availableByType[type]) availableByType[type] = 0;
      availableByType[type]++;
      totalAvailable++;
    });

    let occupiedCount = 0;
    rooms.forEach((r: any) => {
      let roomOccupied = false;
      if (r.status === "maintenance" || (r.maintenance_start && r.maintenance_end)) {
        if (
          !r.maintenance_start ||
          (dateStr >= r.maintenance_start && dateStr < r.maintenance_end)
        ) {
          roomOccupied = true;
        }
      }

      if (!roomOccupied) {
        const dailyBookings = bookings.filter(
          (b: any) =>
            b.room_id === r.id &&
            b.status !== "rejected" &&
            b.status !== "cancelled" &&
            b.status !== "completed",
        );
        for (const b of dailyBookings) {
          const isBooked =
            b.check_in === b.check_out
              ? dateStr === b.check_in
              : dateStr >= b.check_in && dateStr < b.check_out;
          if (isBooked) {
            roomOccupied = true;
            break;
          }
        }
      }
      
      if (roomOccupied) {
        occupiedCount++;
        const type = r.type || "room";
        if (availableByType[type]) {
          availableByType[type]--;
        }
      }
    });

    const formatAvailability = (avail: Record<string, number>) => {
      const parts = [];
      if (avail.room > 0) parts.push(`${avail.room} room(s)`);
      if (avail.cottage > 0) parts.push(`${avail.cottage} cottage(s)`);
      if (avail.villa > 0) parts.push(`${avail.villa} function hall(s)`);
      return parts.join(", ") || "0";
    };

    const detailsStr = formatAvailability(availableByType);

    const availableCount = totalRooms - occupiedCount;
    if (availableCount === 0) return { status: "booked", availableCount: 0, detailsStr: "" };
    if (availableCount < totalRooms) return { status: "limited", availableCount, detailsStr };
    return { status: "available", availableCount, detailsStr };
  };

  const CustomDayButton = (dayProps: React.ComponentProps<typeof DayButton>) => {
    const { day, modifiers, className: defaultClassName, ...btnProps } = dayProps;
    const { status, availableCount, detailsStr, reason } = getAvailability(day.date);

    const isBooked = status === "booked";
    const isPast = status === "past";
    const isLimited = status === "limited";
    const isAvailable = status === "available";
    const isSelected = !!modifiers.selected;

    let tooltipText = "";
    if (isPast) {
      tooltipText = "Past date";
    } else if (isBooked) {
      tooltipText = reason ? reason : "Not Available (Fully Booked)";
    } else if (isLimited) {
      tooltipText = `Limited Availability: ${detailsStr} left`;
    } else if (isAvailable) {
      tooltipText = `Available: ${detailsStr}`;
    }

    return (
      <TooltipProvider>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <button
              type="button"
              {...btnProps}
              disabled={btnProps.disabled || isBooked || isPast}
              aria-disabled={isBooked || isPast}
              className={cn(
                "h-9 w-9 p-0 font-medium rounded-md transition-all flex items-center justify-center text-sm relative select-none",
                isBooked &&
                  "!bg-red-600 hover:!bg-red-700 !text-white font-bold shadow-sm !cursor-not-allowed !opacity-100 border border-red-700 ring-0",
                isSelected &&
                  !isBooked &&
                  "!bg-blue-600 hover:!bg-blue-700 !text-white font-bold ring-2 ring-blue-400 ring-offset-2 shadow-sm",
                isLimited &&
                  !isSelected &&
                  "!bg-amber-500 hover:!bg-amber-600 !text-white font-medium shadow-xs",
                isAvailable &&
                  !isSelected &&
                  "!bg-emerald-600 hover:!bg-emerald-700 !text-white font-medium shadow-xs",
                isPast &&
                  "!bg-slate-100 !text-slate-400 !opacity-50 !cursor-not-allowed line-through",
              )}
            >
              <span>{day.date.getDate()}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="z-[60] font-medium shadow-md text-xs">{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <Calendar
      mode={mode}
      selected={selected}
      onSelect={onSelect}
      className={cn("p-3 bg-card rounded-xl border shadow-sm", className)}
      components={{
        DayButton: CustomDayButton,
      }}
      disabled={(date) => {
        const { status } = getAvailability(date);
        return status === "booked" || status === "past";
      }}
      {...props}
    />
  );
}
