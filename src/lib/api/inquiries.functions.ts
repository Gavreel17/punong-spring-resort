import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import ws from "ws";

if (typeof window === "undefined" && typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = ws;
}

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://dqpbbzsxfwbozqcguwux.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";

export const sendInquiryReplyServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      inquiryId: z.string().min(1),
      recipientEmail: z.string().email(),
      recipientName: z.string().min(1),
      subject: z.string().min(1),
      message: z.string().min(1),
      originalMessage: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    try {
      const { createClient } = await import("@supabase/supabase-js");

      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        realtime: { transport: ws as any },
      });

      const now = new Date().toISOString();

      // 1. Insert admin reply message into inquiry_messages thread
      const { error: msgError } = await (client as any)
        .from("inquiry_messages")
        .insert({
          inquiry_id: data.inquiryId,
          sender_id: null,
          sender_role: "admin",
          message: data.message,
          created_at: now,
          read_at: null, // Unread until customer opens it
        });

      if (msgError) {
        console.warn("[Inquiry Message Insert Notice]:", msgError.message);
      }

      // 2. Update inquiries status to 'replied'
      const { error: updateError } = await (client as any)
        .from("inquiries")
        .update({
          status: "replied",
          replied_at: now,
          admin_reply: data.message,
          updated_at: now,
        })
        .eq("id", data.inquiryId);

      if (updateError) {
        console.warn("[Inquiry Update Notice]:", updateError.message);
      }

      // 3. Send email notification via Brevo through the Supabase Edge Function
      let emailSent = false;
      let emailWarning = "";

      try {
        const { data: edgeRes, error: edgeErr } = await client.functions.invoke("booking-emails", {
          body: {
            emailType: "inquiry_reply",
            replyData: {
              recipientEmail: data.recipientEmail,
              recipientName: data.recipientName,
              subject: data.subject || "New Message from Punong Spring Resort",
              message: data.message,
              originalMessage: data.originalMessage,
            },
          },
        });

        if (edgeErr) {
          console.warn("[Brevo Edge Function Notice]:", edgeErr.message);
          emailWarning = edgeErr.message;
        } else if (edgeRes?.error) {
          console.warn("[Brevo Delivery Notice]:", edgeRes.error);
          emailWarning = edgeRes.error;
        } else {
          emailSent = true;
        }
      } catch (err: any) {
        console.warn("[Email Dispatch Exception]:", err.message);
        emailWarning = err.message || "Email service unreachable";
      }

      return {
        success: true,
        emailSent,
        emailWarning: emailSent ? undefined : emailWarning,
      };
    } catch (err: any) {
      console.error("[sendInquiryReplyServerFn Error]:", err);
      throw new Error(err.message || "Failed to process inquiry reply.");
    }
  });

export const sendCustomerFollowUpServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      inquiryId: z.string().min(1),
      customerId: z.string().optional(),
      message: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    try {
      const { createClient } = await import("@supabase/supabase-js");

      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        realtime: { transport: ws as any },
      });

      const now = new Date().toISOString();

      // 1. Insert customer message into inquiry_messages thread
      const { error: msgError } = await (client as any)
        .from("inquiry_messages")
        .insert({
          inquiry_id: data.inquiryId,
          sender_id: data.customerId || null,
          sender_role: "customer",
          message: data.message,
          created_at: now,
          read_at: now,
        });

      if (msgError) {
        console.error("[Customer Follow-Up Message Error]:", msgError.message);
        throw new Error(msgError.message);
      }

      // 2. Update inquiries status to 'waiting_reply' and update timestamp
      const { error: updateError } = await (client as any)
        .from("inquiries")
        .update({
          status: "waiting_reply",
          updated_at: now,
        })
        .eq("id", data.inquiryId);

      if (updateError) {
        console.warn("[Inquiry Update Notice]:", updateError.message);
      }

      return { success: true };
    } catch (err: any) {
      console.error("[sendCustomerFollowUpServerFn Error]:", err);
      throw new Error(err.message || "Failed to send follow-up message.");
    }
  });
