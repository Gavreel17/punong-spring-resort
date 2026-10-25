import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import fs from "fs";
import path from "path";
import ws from "ws";

if (typeof window === "undefined" && typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = ws;
}

export interface AdminSessionRecord {
  id: string;
  user_id: string;
  session_token: string;
  device_name: string;
  browser_name: string;
  os_name: string;
  ip_address?: string;
  status: "active" | "revoked";
  created_at: string;
  last_active_at: string;
  revoked_at?: string | null;
  user_agent?: string;
}

// Local persistent file fallback for seamless multi-device tracking
const SESSIONS_FILE_PATH = path.resolve(process.cwd(), ".admin-sessions.json");

function readLocalSessions(): AdminSessionRecord[] {
  try {
    if (fs.existsSync(SESSIONS_FILE_PATH)) {
      const content = fs.readFileSync(SESSIONS_FILE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn("[Admin Sessions] Failed to read local sessions file:", e);
  }
  return [];
}

function writeLocalSessions(sessions: AdminSessionRecord[]) {
  try {
    fs.writeFileSync(SESSIONS_FILE_PATH, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (e) {
    console.warn("[Admin Sessions] Failed to write local sessions file:", e);
  }
}

async function getSupabaseServerClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || "https://dqpbbzsxfwbozqcguwux.supabase.co";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: ws as any },
  });
}

export function parseDeviceAndBrowser(ua?: string) {
  if (!ua) {
    return {
      deviceName: "Workstation",
      browserName: "Web Browser",
      osName: "Desktop OS",
    };
  }

  let osName = "Unknown OS";
  let deviceName = "Desktop Workstation";

  if (/Windows NT 10.0/i.test(ua) || /Windows NT 11.0/i.test(ua)) {
    osName = "Windows 11 / 10";
    deviceName = "Windows PC";
  } else if (/Windows NT/i.test(ua)) {
    osName = "Windows";
    deviceName = "Windows PC";
  } else if (/iPhone/i.test(ua)) {
    osName = "iOS";
    deviceName = "Apple iPhone";
  } else if (/iPad/i.test(ua)) {
    osName = "iPadOS";
    deviceName = "Apple iPad";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    osName = "macOS";
    deviceName = "MacBook / Mac";
  } else if (/Android/i.test(ua)) {
    osName = "Android";
    deviceName = "Android Mobile";
  } else if (/Linux/i.test(ua)) {
    osName = "Linux";
    deviceName = "Linux Workstation";
  }

  let browserName = "Web Browser";
  if (/Edg\//i.test(ua)) {
    browserName = "Microsoft Edge";
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    browserName = "Google Chrome";
  } else if (/Firefox\//i.test(ua)) {
    browserName = "Mozilla Firefox";
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browserName = "Apple Safari";
  } else if (/OPR|Opera/i.test(ua)) {
    browserName = "Opera";
  }

  return { deviceName, browserName, osName };
}

/**
 * Core: Register a new authenticated session for a device / browser
 */
export async function registerAdminSessionCore(data: {
  userId: string;
  userAgent?: string;
  clientDeviceName?: string;
}) {
  const { deviceName, browserName, osName } = parseDeviceAndBrowser(data.userAgent);
  const finalDeviceName = data.clientDeviceName || deviceName;
  const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
  const sessionId = `as_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();

  const record: AdminSessionRecord = {
    id: sessionId,
    user_id: data.userId,
    session_token: sessionToken,
    device_name: finalDeviceName,
    browser_name: browserName,
    os_name: osName,
    status: "active",
    created_at: now,
    last_active_at: now,
    revoked_at: null,
    user_agent: data.userAgent || "",
  };

  // Try DB first
  try {
    const client = await getSupabaseServerClient();
    const { error } = await client.from("admin_sessions").insert({
      id: sessionId,
      user_id: data.userId,
      session_token: sessionToken,
      device_name: finalDeviceName,
      browser_name: browserName,
      os_name: osName,
      status: "active",
      created_at: now,
      last_active_at: now,
      user_agent: data.userAgent || "",
    });

    if (error) {
      console.warn("[Admin Sessions] Database insert failed, falling back to local file store:", error.message);
    }
  } catch (e) {
    console.warn("[Admin Sessions] Database exception, fallback store engaged:", e);
  }

  // Always update local file store as resilient fallback
  const all = readLocalSessions().filter((s) => s.id !== sessionId);
  all.unshift(record);
  writeLocalSessions(all.slice(0, 50));

  return {
    success: true,
    session: record,
  };
}

/**
 * Core: Validate session status (heartbeat / auth check)
 */
export async function validateAdminSessionCore(data: {
  sessionToken: string;
  userId?: string;
}) {
  const now = new Date().toISOString();

  // Check DB
  try {
    const client = await getSupabaseServerClient();
    const { data: dbSession, error } = await client
      .from("admin_sessions")
      .select("*")
      .eq("session_token", data.sessionToken)
      .maybeSingle();

    if (!error && dbSession) {
      if (dbSession.status === "revoked") {
        return {
          valid: false,
          reason: "Session has been terminated by administrator.",
        };
      }
      // Update heartbeat in DB
      await client
        .from("admin_sessions")
        .update({ last_active_at: now })
        .eq("session_token", data.sessionToken);

      // Keep local store in sync
      const local = readLocalSessions();
      const found = local.find((s) => s.session_token === data.sessionToken);
      if (found) {
        found.last_active_at = now;
        found.status = dbSession.status;
        writeLocalSessions(local);
      }

      return {
        valid: true,
        session: dbSession as AdminSessionRecord,
      };
    }
  } catch (e) {
    // Fallback to local file store
  }

  // Fallback store check
  const local = readLocalSessions();
  const session = local.find((s) => s.session_token === data.sessionToken);

  if (!session) {
    return {
      valid: false,
      reason: "Session not found or expired.",
    };
  }

  if (session.status === "revoked") {
    return {
      valid: false,
      reason: "Session has been terminated by administrator.",
    };
  }

  // Update heartbeat in local store
  session.last_active_at = now;
  writeLocalSessions(local);

  return {
    valid: true,
    session,
  };
}

/**
 * Core: List all sessions for the admin user
 */
export async function listAdminSessionsCore(data: { userId?: string }) {
  let dbSessions: AdminSessionRecord[] = [];

  try {
    const client = await getSupabaseServerClient();
    let query = client.from("admin_sessions").select("*").order("last_active_at", { ascending: false });
    if (data.userId) {
      query = query.eq("user_id", data.userId);
    }
    const { data: res, error } = await query;
    if (!error && res && res.length > 0) {
      dbSessions = res as AdminSessionRecord[];
    }
  } catch (e) {
    // Ignore DB error, use fallback
  }

  if (dbSessions.length > 0) {
    return { sessions: dbSessions };
  }

  // Fallback to local store
  const local = readLocalSessions();
  const filtered = data.userId
    ? local.filter((s) => s.user_id === data.userId)
    : local;

  return {
    sessions: filtered.sort(
      (a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()
    ),
  };
}

/**
 * Core: Revoke all OTHER sessions (Logout From All Other Sessions)
 */
export async function revokeOtherAdminSessionsCore(data: {
  currentSessionToken: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  let dbUpdatedCount = 0;

  // 1. Update in Database
  try {
    const client = await getSupabaseServerClient();
    const { data: updated, error } = await client
      .from("admin_sessions")
      .update({ status: "revoked", revoked_at: now })
      .eq("user_id", data.userId)
      .neq("session_token", data.currentSessionToken)
      .select();

    if (!error && updated) {
      dbUpdatedCount = updated.length;
    }
  } catch (e) {
    console.warn("[Admin Sessions] DB update on revoke others failed:", e);
  }

  // 2. Update in Local File Store
  const local = readLocalSessions();
  let localUpdatedCount = 0;

  const modified = local.map((s) => {
    if (s.user_id === data.userId && s.session_token !== data.currentSessionToken) {
      localUpdatedCount++;
      return {
        ...s,
        status: "revoked" as const,
        revoked_at: now,
      };
    }
    return s;
  });

  writeLocalSessions(modified);

  return {
    success: true,
    revokedCount: Math.max(dbUpdatedCount, localUpdatedCount),
    message: "Successfully logged out from all other devices and browsers.",
  };
}

/**
 * Core: Revoke a single specific session
 */
export async function revokeSingleAdminSessionCore(data: {
  sessionToken: string;
  userId: string;
}) {
  const now = new Date().toISOString();

  // 1. Update in Database
  try {
    const client = await getSupabaseServerClient();
    await client
      .from("admin_sessions")
      .update({ status: "revoked", revoked_at: now })
      .eq("session_token", data.sessionToken)
      .eq("user_id", data.userId);
  } catch (e) {}

  // 2. Update in Local File Store
  const local = readLocalSessions();
  const modified = local.map((s) => {
    if (s.session_token === data.sessionToken && s.user_id === data.userId) {
      return {
        ...s,
        status: "revoked" as const,
        revoked_at: now,
      };
    }
    return s;
  });

  writeLocalSessions(modified);

  return {
    success: true,
    message: "Session revoked successfully.",
  };
}

// -------------------------------------------------------------
// TanStack Start Server Functions
// -------------------------------------------------------------

export const registerAdminSessionServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      userId: z.string(),
      userAgent: z.string().optional(),
      clientDeviceName: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    return registerAdminSessionCore(data);
  });

export const validateAdminSessionServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionToken: z.string(),
      userId: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    return validateAdminSessionCore(data);
  });

export const listAdminSessionsServerFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      userId: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    return listAdminSessionsCore(data);
  });

export const revokeOtherAdminSessionsServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      currentSessionToken: z.string(),
      userId: z.string(),
    })
  )
  .handler(async ({ data }) => {
    return revokeOtherAdminSessionsCore(data);
  });

export const revokeSingleAdminSessionServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionToken: z.string(),
      userId: z.string(),
    })
  )
  .handler(async ({ data }) => {
    return revokeSingleAdminSessionCore(data);
  });
