import { supabase } from "@/integrations/supabase/client";

/**
 * Service to manage and determine customer welcome greetings:
 * - New user first entry: "Welcome, [Customer Name]"
 * - Page refresh during same session: retains "Welcome, [Customer Name]"
 * - Subsequent login / Returning user: "Welcome Back, [Customer Name]"
 */

const SESSION_NEW_REG_PREFIX = "punong_active_new_reg_";
const LOCAL_RETURNING_PREFIX = "punong_returning_user_";
const RECENT_SIGNUP_KEY = "punong_recent_signup_id";

/**
 * Call when a user completes a brand new registration.
 * Marks this user as a newly registered account in their first session.
 */
export async function markNewRegistration(userId: string, fullname?: string): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(`${SESSION_NEW_REG_PREFIX}${userId}`, "true");
      sessionStorage.setItem(RECENT_SIGNUP_KEY, userId);
      localStorage.removeItem(`${LOCAL_RETURNING_PREFIX}${userId}`);
      localStorage.setItem(`punong_reg_date_${userId}`, new Date().toISOString());
    } catch (e) {
      console.warn("Storage warning in markNewRegistration:", e);
    }
  }

  // Record registration and initial login in Supabase metadata and DB
  try {
    await supabase.auth.updateUser({
      data: {
        is_new_registration: true,
        login_count: 1,
        initial_registration_date: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
        ...(fullname ? { fullname, full_name: fullname } : {}),
      },
    });
  } catch (err) {
    console.warn("Error updating user metadata on signup:", err);
  }

  // Try DB RPC/profile update if supported
  try {
    await (supabase.rpc as any)("record_user_login", { user_id_param: userId });
  } catch (_) {
    // Non-blocking fallback
  }
}

/**
 * Call when a user signs in through the standard login form.
 * Marks the user as a returning user on subsequent logins.
 */
export async function markSubsequentLogin(userId: string, currentMeta?: any): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(`${SESSION_NEW_REG_PREFIX}${userId}`);
      sessionStorage.removeItem(RECENT_SIGNUP_KEY);
      localStorage.setItem(`${LOCAL_RETURNING_PREFIX}${userId}`, "true");
      localStorage.setItem(`punong_last_login_${userId}`, new Date().toISOString());
    } catch (e) {
      console.warn("Storage warning in markSubsequentLogin:", e);
    }
  }

  const currentCount = Number(currentMeta?.login_count || 1);
  const nextCount = currentCount + 1;

  try {
    await supabase.auth.updateUser({
      data: {
        is_new_registration: false,
        login_count: nextCount,
        last_login_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn("Error updating user metadata on subsequent login:", err);
  }

  try {
    await (supabase.rpc as any)("record_user_login", { user_id_param: userId });
  } catch (_) {
    // Non-blocking fallback
  }
}

/**
 * Call when the user signs out.
 * Cleans up first-entry session markers and marks account as having completed a session.
 */
export async function markSignOut(userId?: string | null): Promise<void> {
  if (!userId) return;

  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(`${SESSION_NEW_REG_PREFIX}${userId}`);
      sessionStorage.removeItem(RECENT_SIGNUP_KEY);
      localStorage.setItem(`${LOCAL_RETURNING_PREFIX}${userId}`, "true");
    } catch (e) {
      console.warn("Storage warning in markSignOut:", e);
    }
  }

  try {
    await supabase.auth.updateUser({
      data: {
        is_new_registration: false,
      },
    });
  } catch (_) {
    // Non-blocking
  }
}

/**
 * Determines whether the user should receive "Welcome Back" or "Welcome".
 * Returns true if the user is a returning user on a subsequent login.
 * Returns false if the user has just registered for the first time during this entry.
 */
export function isReturningCustomer(user: any, profile?: any): boolean {
  if (!user || !user.id) return false;

  const userId = user.id;

  // 1. Check if the current browser session has active first-entry registration flag
  if (typeof window !== "undefined") {
    const isNewRegSession =
      sessionStorage.getItem(`${SESSION_NEW_REG_PREFIX}${userId}`) === "true" ||
      sessionStorage.getItem(RECENT_SIGNUP_KEY) === userId;

    if (isNewRegSession) {
      // User is within their initial session after registering.
      // Retain "Welcome" even across page refreshes and route changes in this session.
      return false;
    }

    // 2. Explicit returning flag set from a previous session or sign-in
    if (localStorage.getItem(`${LOCAL_RETURNING_PREFIX}${userId}`) === "true") {
      return true;
    }
  }

  // 3. Check database / user metadata login history
  const loginCount = Number(
    profile?.login_count ??
    user?.user_metadata?.login_count ??
    0
  );

  if (loginCount > 1) {
    return true;
  }

  if (user?.user_metadata?.is_new_registration === false) {
    return true;
  }

  // 4. Registration timestamp vs current session
  // If the account was registered in the past (more than 10 minutes ago) or has previous bookings,
  // it existed before the current session and is returning.
  const createdAtStr = profile?.created_at || user?.created_at;
  if (createdAtStr) {
    const createdAtMs = new Date(createdAtStr).getTime();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (!isNaN(createdAtMs) && createdAtMs < tenMinutesAgo) {
      return true;
    }
  }

  // 5. If user_metadata says is_new_registration is true, treat as new
  if (user?.user_metadata?.is_new_registration === true) {
    return false;
  }

  // Default for existing accounts with no explicit new-registration flag: returning
  return true;
}
