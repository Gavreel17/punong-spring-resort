import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  registerAdminSession,
  validateAdminSession,
  listAdminSessions,
  revokeOtherAdminSessions,
  revokeSingleAdminSession,
  parseDeviceAndBrowser,
  type AdminSessionRecord,
} from "@/lib/admin-sessions";

export type { AdminSessionRecord };
export { parseDeviceAndBrowser };

export const registerAdminSessionServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      userId: z.string(),
      userAgent: z.string().optional(),
      clientDeviceName: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const session = await registerAdminSession(data.userId, data.userAgent, data.clientDeviceName);
    return { success: true, session };
  });

export const validateAdminSessionServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionToken: z.string(),
      userId: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    return validateAdminSession(data.sessionToken, data.userId);
  });

export const listAdminSessionsServerFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      userId: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const sessions = await listAdminSessions(data.userId);
    return { sessions };
  });

export const revokeOtherAdminSessionsServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      currentSessionToken: z.string(),
      userId: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const res = await revokeOtherAdminSessions(data.currentSessionToken, data.userId);
    return {
      success: res.success,
      revokedCount: res.revokedCount,
      message: "Successfully logged out from all other devices and browsers.",
    };
  });

export const revokeSingleAdminSessionServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionToken: z.string(),
      userId: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const res = await revokeSingleAdminSession(data.sessionToken, data.userId);
    return { success: res.success, message: "Session revoked successfully." };
  });
