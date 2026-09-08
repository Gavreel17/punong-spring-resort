import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) ||
  "https://dqpbbzsxfwbozqcguwux.supabase.co";

const supabaseAnonKey =
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env?.VITE_SUPABASE_ANON_KEY)) ||
  (typeof process !== "undefined" &&
    (process.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env?.VITE_SUPABASE_ANON_KEY)) ||
  "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

const isServer = typeof window === "undefined";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: !isServer,
  },
  ...(isServer
    ? {
        realtime: {
          transport: ws as any,
        },
      }
    : {}),
}) as any;
