import { supabase } from "@/integrations/supabase/client";

export type TrashEntityType = "booking" | "room" | "inquiry" | "customer" | "feedback";

export interface TrashItem {
  id: string;
  type: TrashEntityType;
  title: string;
  subtitle?: string;
  description?: string;
  amount?: number;
  dates?: string;
  deleted_at: string;
  data: any;
}

const STORAGE_KEY = "punong_admin_trash_registry_v1";

function getLocalTrash(): TrashItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load local trash registry:", err);
    return [];
  }
}

function setLocalTrash(items: TrashItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to save local trash registry:", err);
  }
}

export const trashService = {
  /**
   * Save an item into the local trash registry (for inquiries, customers, feedback, etc.)
   */
  recordDeleted(item: Omit<TrashItem, "deleted_at"> & { deleted_at?: string }): void {
    const items = getLocalTrash().filter((i) => i.id !== item.id);
    const newEntry: TrashItem = {
      ...item,
      deleted_at: item.deleted_at || new Date().toISOString(),
    };
    items.unshift(newEntry);
    setLocalTrash(items);
  },

  /**
   * Remove an item from the local trash registry
   */
  removeLocal(id: string): void {
    const items = getLocalTrash().filter((i) => i.id !== id);
    setLocalTrash(items);
  },

  /**
   * Fetch all recently deleted items combined across database (bookings, rooms) and local registry
   */
  async getAllDeleted(): Promise<TrashItem[]> {
    const allItems: TrashItem[] = [];

    // 1. Fetch soft-deleted bookings from Supabase
    try {
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("*, room:rooms(name, type, price), payments(amount, status, notes)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (!error && bookings) {
        bookings.forEach((b: any) => {
          allItems.push({
            id: b.id,
            type: "booking",
            title: b.guest_name || "Reservation",
            subtitle: b.room?.name ? `${b.room.name} (${b.room.type?.toUpperCase()})` : `Booking #${b.id.slice(0, 8)}`,
            description: `${b.guest_email || "No email"} • ${b.guest_phone || "No phone"} • ${b.guests || 1} guest(s)`,
            amount: b.total_amount,
            dates: `${b.check_in} → ${b.check_out}`,
            deleted_at: b.deleted_at || b.updated_at || new Date().toISOString(),
            data: b,
          });
        });
      }
    } catch (err) {
      console.error("Error fetching deleted bookings:", err);
    }

    // 2. Fetch soft-deleted rooms from Supabase
    try {
      const { data: rooms, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("status", "deleted")
        .order("updated_at", { ascending: false });

      if (!error && rooms) {
        rooms.forEach((r: any) => {
          const typeName = r.type === "villa" ? "Function Hall" : r.type?.toUpperCase();
          allItems.push({
            id: r.id,
            type: "room",
            title: r.name,
            subtitle: `${typeName} Accommodation`,
            description: `Capacity: ${r.capacity} persons • Rate: ₱${Number(r.price).toLocaleString()}${r.rate_type === 'day' ? '/day' : '/night'}`,
            amount: r.price,
            dates: `Rate: ₱${Number(r.price).toLocaleString()}`,
            deleted_at: r.updated_at || new Date().toISOString(),
            data: r,
          });
        });
      }
    } catch (err) {
      console.error("Error fetching deleted rooms:", err);
    }

    // 3. Include other items from persistent trash registry (inquiries, customers, feedbacks)
    const localItems = getLocalTrash();
    // Exclude if already in bookings or rooms
    localItems.forEach((local) => {
      if (!allItems.some((existing) => existing.id === local.id)) {
        allItems.push(local);
      }
    });

    // Sort all by deleted_at descending
    return allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
  },

  /**
   * Restore a single trash item
   */
  async restore(item: TrashItem): Promise<{ success: boolean; message?: string }> {
    try {
      if (item.type === "booking") {
        const { error } = await supabase.from("bookings").update({ deleted_at: null }).eq("id", item.id);
        if (error) throw error;
      } else if (item.type === "room") {
        const { error } = await supabase.from("rooms").update({ status: "available" }).eq("id", item.id);
        if (error) throw error;
      } else if (item.type === "inquiry") {
        // Re-insert inquiry into database
        const payload = { ...item.data };
        delete payload.inquiry_messages;
        const { error } = await supabase.from("inquiries").upsert([payload]);
        if (error) throw error;
        trashService.removeLocal(item.id);
      } else if (item.type === "customer") {
        // Re-insert profile if it had one
        if (item.data?.profileId) {
          const profilePayload = {
            id: item.data.profileId,
            fullname: item.data.fullname || item.title,
            email: item.data.email || "",
            phone: item.data.phone || null,
          };
          const { error } = await supabase.from("profiles").upsert([profilePayload]);
          if (error) throw error;
        }
        trashService.removeLocal(item.id);
      } else if (item.type === "feedback") {
        const { error } = await supabase.from("feedbacks").upsert([item.data]);
        if (error) throw error;
        trashService.removeLocal(item.id);
      }

      trashService.removeLocal(item.id);
      return { success: true };
    } catch (err: any) {
      console.error("Failed to restore item:", err);
      return { success: false, message: err.message || "Failed to restore item." };
    }
  },

  /**
   * Permanently delete a single trash item
   */
  async deletePermanently(item: TrashItem): Promise<{ success: boolean; message?: string }> {
    try {
      if (item.type === "booking") {
        // Try deleting payments first if any exist
        await supabase.from("payments").delete().eq("booking_id", item.id);
        const { error } = await supabase.from("bookings").delete().eq("id", item.id);
        if (error) throw error;
      } else if (item.type === "room") {
        const { error } = await supabase.from("rooms").delete().eq("id", item.id);
        if (error) {
          // If foreign key constraint blocks deletion due to past reservation records
          if (error.message.includes("violates foreign key") || error.message.includes("constraint")) {
            return {
              success: false,
              message:
                "This room cannot be permanently deleted because past reservations reference it. It will remain safely hidden in Recently Deleted.",
            };
          }
          throw error;
        }
      } else if (item.type === "inquiry") {
        await supabase.from("inquiry_messages").delete().eq("inquiry_id", item.id);
        await supabase.from("inquiries").delete().eq("id", item.id);
        trashService.removeLocal(item.id);
      } else if (item.type === "customer") {
        if (item.data?.profileId) {
          await supabase.from("profiles").delete().eq("id", item.data.profileId);
        }
        trashService.removeLocal(item.id);
      } else if (item.type === "feedback") {
        await supabase.from("feedbacks").delete().eq("id", item.id);
        trashService.removeLocal(item.id);
      }

      trashService.removeLocal(item.id);
      return { success: true };
    } catch (err: any) {
      console.error("Failed to permanently delete item:", err);
      return { success: false, message: err.message || "Failed to permanently delete item." };
    }
  },

  /**
   * Empty all items in trash
   */
  async emptyAll(items: TrashItem[]): Promise<{ successCount: number; failCount: number }> {
    let successCount = 0;
    let failCount = 0;

    for (const item of items) {
      const res = await trashService.deletePermanently(item);
      if (res.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    return { successCount, failCount };
  },
};
