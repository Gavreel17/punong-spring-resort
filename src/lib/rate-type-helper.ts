/**
 * Rate Type Helper for Punong Spring Resort
 * 
 * Supports both:
 * 1. Native rooms.rate_type column in Supabase (when migration is applied)
 * 2. Resilient fallback via rooms.amenities tag (e.g. 'rate_type:day' | 'rate_type:nightly')
 * 3. Client cache persistence so admin changes reflect immediately across customer pages
 */

export type RoomRateType = "nightly" | "day";

const STORAGE_KEY_PREFIX = "punong_room_rate_type_";

export function getRoomRateType(room: any): RoomRateType {
  if (!room) return "nightly";

  // 1. Direct column property if set
  if (room.rate_type === "day" || room.rate_type === "nightly") {
    return room.rate_type;
  }

  // 2. Check amenities array tag
  if (Array.isArray(room.amenities)) {
    if (room.amenities.includes("rate_type:day")) return "day";
    if (room.amenities.includes("rate_type:nightly")) return "nightly";
  }

  // 3. Check localStorage cache as fallback if room has an id
  if (typeof window !== "undefined" && room.id) {
    try {
      const cached = localStorage.getItem(`${STORAGE_KEY_PREFIX}${room.id}`);
      if (cached === "day" || cached === "nightly") {
        return cached;
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  return "nightly";
}

export function attachRateTypeToAmenities(
  amenities: string[] | null | undefined,
  rateType: RoomRateType
): string[] {
  const current = Array.isArray(amenities) ? [...amenities] : [];
  const clean = current.filter((item) => typeof item === "string" && !item.startsWith("rate_type:"));
  clean.push(`rate_type:${rateType}`);
  return clean;
}

export function enrichRoomWithRateType<T extends { id?: string; rate_type?: any; amenities?: any }>(
  room: T
): T & { rate_type: RoomRateType } {
  if (!room) return room as any;
  const rateType = getRoomRateType(room);
  return {
    ...room,
    rate_type: rateType,
  };
}

export function saveRoomRateTypeCache(roomId: string, rateType: RoomRateType): void {
  if (typeof window === "undefined" || !roomId) return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${roomId}`, rateType);
    window.dispatchEvent(
      new CustomEvent("punong-rate-type-changed", {
        detail: { roomId, rateType },
      })
    );
  } catch {
    // Ignore localStorage write errors
  }
}

export function getRateTypeDisplay(rateType: string | undefined | null) {
  const isDay = rateType === "day";
  return {
    isDay,
    label: isDay ? "Day Rate" : "Nightly Rate",
    unit: isDay ? "day" : "night",
    unitPlural: isDay ? "days" : "nights",
    perUnit: isDay ? "/ day" : "/ night",
    perUnitBilled: isDay ? "per day" : "per night",
    durationLabel: isDay ? "Days" : "Nights",
  };
}

export function getAccommodationCategoryLabel(type?: string | null): string {
  if (!type) return "Accommodation";
  const normalized = String(type).trim().toLowerCase();
  if (normalized === "cottage") return "Cottage";
  if (
    normalized === "villa" ||
    normalized === "function hall" ||
    normalized === "function_hall" ||
    normalized.includes("function") ||
    normalized.includes("hall")
  ) {
    return "Function Hall";
  }
  if (normalized === "room") return "Room";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

