import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SystemSettings {
  resort_name: string;
  contact_number: string;
  contact_email: string;
  address: string;
  business_hours: string;
  default_booking_status: string;
  default_payment_status: string;
  theme: "light" | "dark" | "system";
  logo_url: string;
  notify_new_booking: boolean;
  notify_inquiry: boolean;
  notify_message: boolean;
  notify_payment: boolean;
  notify_cancellation: boolean;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  resort_name: "Punong Spring Resort",
  contact_number: "+639120627744",
  contact_email: "punongspringresort@gmail.com",
  address: "Brgy. Guba, Cebu City, Philippines",
  business_hours: "8:00 AM - 6:00 PM (Daily)",
  default_booking_status: "pending",
  default_payment_status: "pending",
  theme: "system",
  logo_url: "/logo.png",
  notify_new_booking: true,
  notify_inquiry: true,
  notify_message: true,
  notify_payment: true,
  notify_cancellation: true,
};

export const SYSTEM_SETTINGS_STORAGE_KEY = "punong-system-settings";

function getCachedSettings(): SystemSettings {
  if (typeof window === "undefined") return DEFAULT_SYSTEM_SETTINGS;
  try {
    const cached = localStorage.getItem(SYSTEM_SETTINGS_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { ...DEFAULT_SYSTEM_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn("Failed to parse cached system settings:", e);
  }
  return DEFAULT_SYSTEM_SETTINGS;
}

// Module-level manager for realtime and window event subscribers
type SettingsListener = (settings: Partial<SystemSettings>) => void;
const activeListeners = new Set<SettingsListener>();
let globalRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let globalEventsRegistered = false;

function initGlobalWindowEvents() {
  if (globalEventsRegistered || typeof window === "undefined") return;
  globalEventsRegistered = true;

  // 1. Same-window custom event
  window.addEventListener("punong-settings-updated", (e: Event) => {
    const customEvent = e as CustomEvent<SystemSettings>;
    if (customEvent.detail) {
      activeListeners.forEach((listener) => listener(customEvent.detail));
    }
  });

  // 2. Cross-tab storage synchronization
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === SYSTEM_SETTINGS_STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        activeListeners.forEach((listener) => listener(parsed));
      } catch {}
    }
  });
}

function ensureRealtimeSubscribed() {
  if (typeof window === "undefined") return;
  if (globalRealtimeChannel) return;

  try {
    // Clean up any stale channel with this topic if it exists
    const existing = supabase
      .getChannels()
      .find(
        (ch: any) =>
          ch.topic === "realtime:public:system_settings" ||
          ch.topic === "public:system_settings"
      );
    if (existing) {
      supabase.removeChannel(existing);
    }

    globalRealtimeChannel = supabase
      .channel("public:system_settings")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "system_settings",
          filter: "id=eq.default",
        },
        (payload: any) => {
          if (payload.new) {
            const updated = { ...DEFAULT_SYSTEM_SETTINGS, ...(payload.new as any) };
            if (typeof window !== "undefined") {
              localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(updated));
            }
            activeListeners.forEach((listener) => listener(updated));
          }
        }
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("System settings realtime subscription status:", status);
        }
      });
  } catch (err) {
    console.warn("Error subscribing to system_settings realtime channel:", err);
  }
}

function cleanupRealtimeIfEmpty() {
  if (activeListeners.size === 0 && globalRealtimeChannel) {
    try {
      supabase.removeChannel(globalRealtimeChannel);
    } catch (err) {
      console.warn("Error removing system_settings channel:", err);
    }
    globalRealtimeChannel = null;
  }
}

export function useSystemSettings() {
  const qc = useQueryClient();

  const { data: settings = getCachedSettings(), isLoading, refetch } = useQuery<SystemSettings>({
    queryKey: ["system-settings"],
    queryFn: async () => {
      // 1. Try table query directly first for clean json mapping
      try {
        const { data, error } = await (supabase as any)
          .from("system_settings")
          .select("*")
          .eq("id", "default")
          .maybeSingle();

        if (!error && data) {
          const merged: SystemSettings = {
            resort_name: data.resort_name || DEFAULT_SYSTEM_SETTINGS.resort_name,
            contact_number: data.contact_number || DEFAULT_SYSTEM_SETTINGS.contact_number,
            contact_email: data.contact_email || DEFAULT_SYSTEM_SETTINGS.contact_email,
            address: data.address || DEFAULT_SYSTEM_SETTINGS.address,
            business_hours: data.business_hours || DEFAULT_SYSTEM_SETTINGS.business_hours,
            default_booking_status: data.default_booking_status || DEFAULT_SYSTEM_SETTINGS.default_booking_status,
            default_payment_status: data.default_payment_status || DEFAULT_SYSTEM_SETTINGS.default_payment_status,
            theme: data.theme || DEFAULT_SYSTEM_SETTINGS.theme,
            logo_url: data.logo_url || DEFAULT_SYSTEM_SETTINGS.logo_url,
            notify_new_booking: data.notify_new_booking ?? true,
            notify_inquiry: data.notify_inquiry ?? true,
            notify_message: data.notify_message ?? true,
            notify_payment: data.notify_payment ?? true,
            notify_cancellation: data.notify_cancellation ?? true,
          };
          if (typeof window !== "undefined") {
            localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
          }
          return merged;
        }
      } catch (e) {
        console.warn("Table query for system_settings failed, trying RPC:", e);
      }

      // 2. Fallback to RPC
      try {
        const { data, error } = await supabase.rpc("get_system_settings");
        if (!error && data) {
          const merged = { ...DEFAULT_SYSTEM_SETTINGS, ...data };
          if (typeof window !== "undefined") {
            localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
          }
          return merged;
        }
      } catch (e) {
        console.warn("RPC query for system_settings failed:", e);
      }

      return getCachedSettings();
    },
    initialData: getCachedSettings(),
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Listen for real-time changes and cross-tab/local updates
  useEffect(() => {
    initGlobalWindowEvents();

    const handleUpdate: SettingsListener = (newSettings) => {
      qc.setQueryData(["system-settings"], (prev: any) => ({
        ...(prev || DEFAULT_SYSTEM_SETTINGS),
        ...newSettings,
      }));
    };

    activeListeners.add(handleUpdate);
    ensureRealtimeSubscribed();

    return () => {
      activeListeners.delete(handleUpdate);
      cleanupRealtimeIfEmpty();
    };
  }, [qc]);

  return { settings, isLoading, refetch };
}
