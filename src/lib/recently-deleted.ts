import { supabase } from "@/integrations/supabase/client";
import { getRoomRateType } from "./rate-type-helper";

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
  deleted_by?: string;
  deleted_by_name?: string;
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
   * Save an item into the database (and backup in local registry)
   */
  async recordDeleted(
    item: Omit<TrashItem, "deleted_at"> & {
      deleted_at?: string;
      deleted_by?: string;
      deleted_by_name?: string;
    }
  ): Promise<void> {
    const finalDeletedAt = item.deleted_at || new Date().toISOString();
    const entry: TrashItem = {
      ...item,
      deleted_at: finalDeletedAt,
    };

    // 1. Save to local fallback cache immediately
    const items = getLocalTrash().filter((i) => i.id !== item.id);
    items.unshift(entry);
    setLocalTrash(items);

    // 2. Persist to Supabase deleted_records table if available
    try {
      const { error: dbErr } = await supabase.from("deleted_records" as any).insert({
        record_id: item.id,
        record_type: item.type,
        title: item.title,
        subtitle: item.subtitle || null,
        description: item.description || null,
        amount: item.amount || null,
        dates: item.dates || null,
        record_data: item.data || {},
        deleted_at: finalDeletedAt,
        deleted_by: item.deleted_by || null,
        deleted_by_name: item.deleted_by_name || null,
      });
      if (dbErr) {
        console.warn("Notice: deleted_records database insert fallback:", dbErr.message);
      }
    } catch (err) {
      console.warn("Notice: deleted_records database insert exception:", err);
    }
  },

  /**
   * Remove an item from the local trash registry
   */
  removeLocal(id: string): void {
    const items = getLocalTrash().filter((i) => i.id !== id);
    setLocalTrash(items);
  },

  /**
   * Check synchronously if an ID is currently in the local trash
   */
  isDeleted(id: string): boolean {
    return getLocalTrash().some((i) => i.id === id);
  },

  /**
   * Get all IDs currently in the local trash
   */
  getLocalTrashIds(type?: TrashEntityType): string[] {
    const list = getLocalTrash();
    if (!type) return list.map((i) => i.id);
    return list.filter((i) => i.type === type).map((i) => i.id);
  },

  /**
   * Fetch all recently deleted items combined across database (bookings, rooms, deleted_records)
   * and offline cache.
   */
  async getAllDeleted(): Promise<TrashItem[]> {
    const allItems: TrashItem[] = [];
    const seenIds = new Set<string>();

    // 1. Fetch soft-deleted bookings directly from Supabase bookings table
    try {
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("*, room:rooms(name, type, price), payments(amount, status, notes)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (!error && bookings) {
        bookings.forEach((b: any) => {
          if (!seenIds.has(b.id)) {
            seenIds.add(b.id);
            allItems.push({
              id: b.id,
              type: "booking",
              title: b.guest_name || "Reservation",
              subtitle: b.room?.name
                ? `${b.room.name} (${b.room.type?.toUpperCase()})`
                : `Booking #${b.id.slice(0, 8)}`,
              description: `${b.guest_email || "No email"} • ${b.guest_phone || "No phone"} • ${b.guests || 1} guest(s)`,
              amount: b.total_amount,
              dates: `${b.check_in} → ${b.check_out}`,
              deleted_at: b.deleted_at || b.updated_at || new Date().toISOString(),
              data: b,
            });
          }
        });
      }
    } catch (err) {
      console.error("Error fetching deleted bookings:", err);
    }

    // 2. Fetch soft-deleted rooms directly from Supabase rooms table
    try {
      const { data: rooms, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("status", "deleted")
        .order("updated_at", { ascending: false });

      if (!error && rooms) {
        rooms.forEach((r: any) => {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            const typeName = r.type === "villa" ? "Function Hall" : r.type?.toUpperCase();
            allItems.push({
              id: r.id,
              type: "room",
              title: r.name,
              subtitle: `${typeName} Accommodation`,
              description: `Capacity: ${r.capacity} persons • Rate: ₱${Number(r.price).toLocaleString()}${getRoomRateType(r) === "day" ? "/day" : "/night"}`,
              amount: r.price,
              dates: `Rate: ₱${Number(r.price).toLocaleString()}`,
              deleted_at: r.updated_at || new Date().toISOString(),
              data: r,
            });
          }
        });
      }
    } catch (err) {
      console.error("Error fetching deleted rooms:", err);
    }

    // 3. Fetch from deleted_records table in Supabase
    try {
      const { data: dbDeleted, error } = await supabase
        .from("deleted_records" as any)
        .select("*")
        .is("restored_at", null)
        .order("deleted_at", { ascending: false });

      if (!error && dbDeleted) {
        dbDeleted.forEach((record: any) => {
          if (!seenIds.has(record.record_id)) {
            seenIds.add(record.record_id);
            allItems.push({
              id: record.record_id,
              type: record.record_type as TrashEntityType,
              title: record.title,
              subtitle: record.subtitle,
              description: record.description,
              amount: record.amount ? Number(record.amount) : undefined,
              dates: record.dates,
              deleted_at: record.deleted_at,
              deleted_by: record.deleted_by,
              deleted_by_name: record.deleted_by_name,
              data: record.record_data,
            });
          }
        });
      }
    } catch (err) {
      console.warn("Notice: deleted_records table query fallback:", err);
    }

    // 4. Merge persistent local backup items (inquiries, customers, feedbacks)
    const localItems = getLocalTrash();
    localItems.forEach((local) => {
      if (!seenIds.has(local.id)) {
        seenIds.add(local.id);
        allItems.push(local);
      }
    });

    // Sort all by deleted_at descending
    return allItems.sort(
      (a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
    );
  },

  /**
   * Restore a single trash item back to its original module
   */
  async restore(item: TrashItem): Promise<{ success: boolean; message?: string }> {
    try {
      if (item.type === "booking") {
        const { error } = await supabase
          .from("bookings")
          .update({ deleted_at: null })
          .eq("id", item.id);
        if (error) throw error;
      } else if (item.type === "room") {
        const { error } = await supabase
          .from("rooms")
          .update({ status: "available", is_available: true })
          .eq("id", item.id);
        if (error) throw error;
      } else if (item.type === "inquiry") {
        // Re-insert inquiry into database
        const raw = item.data || {};
        const inquiryPayload: any = {
          id: raw.id || item.id,
          name: raw.name || item.title?.split(" (")[0] || "Customer",
          email: raw.email || (item.title?.includes("(") ? item.title.split("(")[1].replace(")", "") : ""),
          message: raw.message || item.description || "Inquiry message",
          status: raw.status || "unread",
          admin_reply: raw.admin_reply || null,
          replied_at: raw.replied_at || null,
          created_at: raw.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (raw.customer_id) {
          inquiryPayload.customer_id = raw.customer_id;
        }

        const { error: inqErr } = await supabase.from("inquiries").upsert([inquiryPayload]);
        if (inqErr) throw inqErr;

        // Restore thread messages if saved
        if (raw.threadMessages && Array.isArray(raw.threadMessages) && raw.threadMessages.length > 0) {
          try {
            await supabase.from("inquiry_messages").upsert(raw.threadMessages);
          } catch (mErr) {
            console.warn("Could not restore inquiry messages thread:", mErr);
          }
        }
      } else if (item.type === "customer") {
        // Re-insert profile if it had one
        const customerProfileId = item.data?.profileId || item.data?.id;
        if (customerProfileId) {
          const profilePayload = {
            id: customerProfileId,
            fullname: item.data.fullname || item.title,
            email: item.data.email || "",
            phone: item.data.phone || null,
            created_at: item.data.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabase.from("profiles").upsert([profilePayload]);
          if (error) throw error;
        }
      } else if (item.type === "feedback") {
        const { error } = await supabase.from("feedbacks").upsert([item.data]);
        if (error) throw error;
      }

      // Mark restored or clean up in deleted_records table
      try {
        await supabase
          .from("deleted_records" as any)
          .delete()
          .eq("record_id", item.id);
      } catch (cleanErr) {
        console.warn("Notice: deleted_records cleanup:", cleanErr);
      }

      trashService.removeLocal(item.id);
      return { success: true };
    } catch (err: any) {
      console.error("Failed to restore item:", err);
      return { success: false, message: err.message || "Failed to restore record." };
    }
  },

  /**
   * Permanently delete a single trash item from the database
   */
  async deletePermanently(item: TrashItem): Promise<{ success: boolean; message?: string }> {
    try {
      if (item.type === "booking") {
        // Try deleting payments first if any exist
        await supabase.from("payments").delete().eq("booking_id", item.id);
        const { error } = await supabase.from("bookings").delete().eq("id", item.id);
        if (error) throw error;
      } else if (item.type === "room") {
        // Check if existing reservations reference this room
        const { data: refs } = await supabase
          .from("bookings")
          .select("id")
          .eq("room_id", item.id)
          .limit(1);

        if (refs && refs.length > 0) {
          return {
            success: false,
            message:
              "This accommodation cannot be permanently deleted because past reservations reference it. It will remain safely hidden in Recently Deleted.",
          };
        }

        const { error } = await supabase.from("rooms").delete().eq("id", item.id);
        if (error) {
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
      } else if (item.type === "customer") {
        const profileId = item.data?.profileId || item.data?.id;
        if (profileId) {
          await supabase.from("profiles").delete().eq("id", profileId);
        }
      } else if (item.type === "feedback") {
        await supabase.from("feedbacks").delete().eq("id", item.id);
      }

      // Remove from deleted_records table
      try {
        await supabase
          .from("deleted_records" as any)
          .delete()
          .eq("record_id", item.id);
      } catch (cleanErr) {
        console.warn("Notice: deleted_records permanent delete cleanup:", cleanErr);
      }

      trashService.removeLocal(item.id);
      return { success: true };
    } catch (err: any) {
      console.error("Failed to permanently delete item:", err);
      return { success: false, message: err.message || "Failed to permanently delete record." };
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
