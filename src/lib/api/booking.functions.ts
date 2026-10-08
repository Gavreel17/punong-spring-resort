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
