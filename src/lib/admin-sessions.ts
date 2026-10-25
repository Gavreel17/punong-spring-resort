import { supabase } from "@/integrations/supabase/client";

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
 * Register a new session for the current device
 */
export async function registerAdminSession(
  userId: string,
  userAgent?: string,
  clientDeviceName?: string
): Promise<AdminSessionRecord> {
  const ua = userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const { deviceName, browserName, osName } = parseDeviceAndBrowser(ua);
  const finalDeviceName = clientDeviceName || deviceName;
  const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
  const sessionId = `as_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();

  const record: AdminSessionRecord = {
    id: sessionId,
    user_id: userId,
    session_token: sessionToken,
    device_name: finalDeviceName,
    browser_name: browserName,
    os_name: osName,
    status: "active",
    created_at: now,
    last_active_at: now,
    revoked_at: null,
    user_agent: ua,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("punong_admin_session_token", sessionToken);
    localStorage.setItem("punong_admin_session_id", sessionId);
  }

  // 1. Try PostgreSQL table admin_sessions
  try {
    const { error } = await supabase.from("admin_sessions").insert({
      id: sessionId,
      user_id: userId,
      session_token: sessionToken,
      device_name: finalDeviceName,
      browser_name: browserName,
      os_name: osName,
      status: "active",
      created_at: now,
      last_active_at: now,
      user_agent: ua,
    });
    if (!error) {
      return record;
    }
  } catch (e) {
    // Table not created yet
  }

  // 2. Cloud Fallback: sync via Supabase Auth user_metadata (no DB migration required)
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const existing: AdminSessionRecord[] = userData.user.user_metadata?.active_sessions || [];
      const updated = [record, ...existing.filter((s) => s.id !== sessionId)].slice(0, 30);
      await supabase.auth.updateUser({
        data: { active_sessions: updated },
      });
    }
  } catch (e) {
    console.warn("[Admin Sessions] Metadata sync notice:", e);
  }

  return record;
}

/**
 * Validate session status
 */
export async function validateAdminSession(
  sessionToken: string,
  userId?: string
): Promise<{ valid: boolean; reason?: string; session?: AdminSessionRecord }> {
  if (!sessionToken) {
    return { valid: true };
  }
  const now = new Date().toISOString();

  // 1. Check PostgreSQL table admin_sessions
  try {
    const { data: dbSession, error } = await supabase
      .from("admin_sessions")
      .select("*")
      .eq("session_token", sessionToken)
      .maybeSingle();

    if (!error && dbSession) {
      if (dbSession.status === "revoked") {
        return {
          valid: false,
          reason: "Session has been terminated by administrator.",
        };
      }
      // Update heartbeat in background
      supabase
        .from("admin_sessions")
        .update({ last_active_at: now })
        .eq("session_token", sessionToken)
        .then(() => {});

      return {
        valid: true,
        session: dbSession as AdminSessionRecord,
      };
    }
  } catch (e) {}

  // 2. Cloud Fallback: check Supabase user_metadata
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.user_metadata?.active_sessions) {
      const sessions: AdminSessionRecord[] = userData.user.user_metadata.active_sessions;
      const found = sessions.find((s) => s.session_token === sessionToken);
      if (found) {
        if (found.status === "revoked") {
          return {
            valid: false,
            reason: "Session has been terminated by administrator.",
          };
        }
        return {
          valid: true,
          session: found,
        };
      }
    }
  } catch (e) {}

  return { valid: true };
}

/**
 * List all sessions for the administrator
 */
export async function listAdminSessions(userId?: string): Promise<AdminSessionRecord[]> {
  // 1. Try PostgreSQL table admin_sessions
  try {
    let query = supabase.from("admin_sessions").select("*").order("last_active_at", { ascending: false });
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data: dbList, error } = await query;
    if (!error && dbList && dbList.length > 0) {
      return dbList as AdminSessionRecord[];
    }
  } catch (e) {}

  // 2. Cloud Fallback: read from Supabase user_metadata
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.user_metadata?.active_sessions) {
      const list: AdminSessionRecord[] = userData.user.user_metadata.active_sessions;
      return list.sort(
        (a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()
      );
    }
  } catch (e) {}

  return [];
}

/**
 * Revoke all other sessions (Logout From All Other Sessions)
 */
export async function revokeOtherAdminSessions(
  currentSessionToken: string,
  userId: string
): Promise<{ success: boolean; revokedCount: number }> {
  const now = new Date().toISOString();
  let count = 0;

  // 1. Update in PostgreSQL table admin_sessions
  try {
    const { data: updated, error } = await supabase
      .from("admin_sessions")
      .update({ status: "revoked", revoked_at: now })
      .eq("user_id", userId)
      .neq("session_token", currentSessionToken)
      .select();
    if (!error && updated) {
      count = updated.length;
    }
  } catch (e) {}

  // 2. Cloud Fallback: update user_metadata.active_sessions
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const existing: AdminSessionRecord[] = userData.user.user_metadata?.active_sessions || [];
      const updatedSessions = existing.map((s) => {
        if (s.session_token !== currentSessionToken) {
          count++;
          return { ...s, status: "revoked" as const, revoked_at: now };
        }
        return s;
      });
      await supabase.auth.updateUser({
        data: { active_sessions: updatedSessions },
      });
    }
  } catch (e) {}

  // 3. Supabase Auth signOut others
  try {
    await supabase.auth.signOut({ scope: "others" });
  } catch (e) {}

  return { success: true, revokedCount: count };
}

/**
 * Revoke a single specific session
 */
export async function revokeSingleAdminSession(
  sessionToken: string,
  userId: string
): Promise<{ success: boolean }> {
  const now = new Date().toISOString();

  // 1. PostgreSQL table
  try {
    await supabase
      .from("admin_sessions")
      .update({ status: "revoked", revoked_at: now })
      .eq("session_token", sessionToken)
      .eq("user_id", userId);
  } catch (e) {}

  // 2. Supabase user_metadata
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const existing: AdminSessionRecord[] = userData.user.user_metadata?.active_sessions || [];
      const updated = existing.map((s) => {
        if (s.session_token === sessionToken) {
          return { ...s, status: "revoked" as const, revoked_at: now };
        }
        return s;
      });
      await supabase.auth.updateUser({
        data: { active_sessions: updated },
      });
    }
  } catch (e) {}

  return { success: true };
}
