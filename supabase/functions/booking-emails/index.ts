// @ts-expect-error: deno land import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: any;

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
// Fallback to a default sender email if not provided in secrets
const SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@punongspringresort.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  emailType: "confirmation" | "status_update" | "inquiry_reply";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bookingData?: any;
  replyData?: {
    recipientEmail: string;
    recipientName: string;
    subject?: string;
    message: string;
    originalMessage?: string;
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { emailType, bookingData, replyData }: EmailPayload = await req.json();

    if (!BREVO_API_KEY) {
      throw new Error("Missing BREVO_API_KEY environment variable");
    }

    let subject = "";
    let htmlContent = "";
    let recipientEmail = "";
    let recipientName = "";

    if (emailType === "confirmation" && bookingData) {
      recipientEmail = bookingData.guest_email;
      recipientName = bookingData.guest_name;
      subject = "Booking Confirmation - Punong Spring Resort";
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #047857;">Booking Received</h2>
          <p>Hi ${bookingData.guest_name},</p>
          <p>Thank you for choosing Punong Spring Resort! Your booking request has been received and is currently <strong>${bookingData.status}</strong>.</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Reservation Details</h3>
            <p><strong>Reference Number:</strong> ${String(bookingData.id).split("-")[0].toUpperCase()}</p>
            <p><strong>Accommodation:</strong> ${bookingData.room?.name || "Unknown"} (${bookingData.room?.type || "Room"})</p>
            <p><strong>Check-in Date:</strong> ${bookingData.check_in}</p>
            <p><strong>Check-out Date:</strong> ${bookingData.check_out}</p>
            <p><strong>Status:</strong> ${bookingData.status.toUpperCase()}</p>
          </div>

          <p>We will review your request and update you once it's confirmed. If you have any questions, feel free to contact us.</p>
          <p>Best regards,<br>Punong Spring Resort Team</p>
        </div>
      `;
    } else if (emailType === "status_update" && bookingData) {
      recipientEmail = bookingData.guest_email;
      recipientName = bookingData.guest_name;
      subject = `Booking Update: ${bookingData.status.toUpperCase()} - Punong Spring Resort`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #047857;">Reservation Status Update</h2>
          <p>Hi ${bookingData.guest_name},</p>
          <p>The status of your reservation has been updated.</p>
          
          <div style="background-color: #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Booking Details</h3>
            <p><strong>Reference Number:</strong> ${String(bookingData.id).split("-")[0].toUpperCase()}</p>
            <p><strong>Accommodation:</strong> ${bookingData.room?.name || "Unknown"} (${bookingData.room?.type || "Room"})</p>
            <p><strong>Check-in Date:</strong> ${bookingData.check_in}</p>
            <p><strong>Check-out Date:</strong> ${bookingData.check_out}</p>
            <p><strong>Status:</strong> <span style="font-weight: bold; color: #047857;">${bookingData.status.toUpperCase()}</span></p>
          </div>

          <p>If you have any questions about this update, please contact our support team.</p>
          <p>Best regards,<br>Punong Spring Resort Team</p>
        </div>
      `;
    } else if (emailType === "inquiry_reply" && replyData) {
      recipientEmail = replyData.recipientEmail;
      recipientName = replyData.recipientName;
      subject = replyData.subject || "Inquiry Response – Punong Spring Resort";
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
          <div style="border-bottom: 2px solid #D4AF37; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #0D1F1D; margin: 0; font-size: 22px;">Punong Spring Resort</h2>
            <span style="color: #D4AF37; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Customer Care & Inquiries</span>
          </div>
          <p>Dear ${replyData.recipientName || "Guest"},</p>
          <p>Thank you for reaching out to Punong Spring Resort. Here is the response to your inquiry:</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #D4AF37; padding: 16px 20px; margin: 20px 0; border-radius: 4px; font-size: 15px; color: #1e293b; white-space: pre-wrap;">${replyData.message}</div>
          ${replyData.originalMessage ? `
            <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 6px; margin: 20px 0; font-size: 12px; color: #64748b;">
              <strong>Your original message:</strong><br />
              "${replyData.originalMessage}"
            </div>
          ` : ""}
          <p>If you have any further questions or wish to proceed with a booking, please reply to this email or visit our website.</p>
          <p style="margin-top: 30px;">Warm regards,<br /><strong>Punong Spring Resort Team</strong></p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0 15px;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center;">
            Punong Spring Resort • Coastal Road, Buburay, Dimataling, Zamboanga del Sur • +63 917 123 4567 • hello@punongresort.com
          </p>
        </div>
      `;
    } else {
      throw new Error("Invalid emailType provided.");
    }

    if (!recipientEmail) {
      throw new Error("Missing recipient email.");
    }

    // Call Brevo API to send the email
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Punong Spring Resort",
          email: SENDER_EMAIL,
        },
        to: [
          {
            email: recipientEmail,
            name: recipientName || "Guest",
          },
        ],
        subject: subject,
        htmlContent: htmlContent,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Brevo API error:", data);
      throw new Error(`Failed to send email via Brevo: ${data.message || JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({ success: true, messageId: data.messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
