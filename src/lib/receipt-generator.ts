import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

export interface BookingData {
  id: string;
  user_id?: string;
  room_id?: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  guests: number;
  total_amount: number | string;
  status: string;
  special_requests?: string | null;
  stay_type?: string | null;
  overnight_fee?: number | null;
  created_at?: string;
  room?: {
    id?: string;
    name?: string;
    type?: string;
    price?: number;
    description?: string;
    image_url?: string;
  } | null;
  payments?: Array<{
    id?: string;
    amount?: number;
    status?: string;
    notes?: string | null;
    receipt_url?: string | null;
    created_at?: string;
  }> | null;
}

export interface ResortSettings {
  resort_name: string;
  contact_number: string;
  contact_email: string;
  address: string;
  business_hours: string;
}

/**
 * Formats a canonical booking reference number: PRS-YYYY-XXXXX
 * Example: PRS-2026-BB6AB14D or PRS-2026-00125
 */
export function formatBookingReference(booking: { id: string; created_at?: string; check_in?: string }): string {
  if (!booking?.id) return "PRS-2026-00000";
  const raw = String(booking.id).trim();

  // If already starts with PRS-, return directly
  if (raw.toUpperCase().startsWith("PRS-")) {
    return raw.toUpperCase();
  }

  const dateSource = booking.created_at || booking.check_in || "";
  const year = dateSource ? new Date(dateSource).getFullYear() : new Date().getFullYear();
  const shortId = raw.split("-")[0].toUpperCase();
  return `PRS-${year}-${shortId}`;
}

/**
 * Returns required filename: Punong-Resort-Receipt-[BookingReference].pdf
 * Example: Punong-Resort-Receipt-PRS-2026-BB6AB14D.pdf
 */
export function getReceiptPdfFilename(booking: { id: string; created_at?: string; check_in?: string }): string {
  const ref = formatBookingReference(booking);
  return `Punong-Resort-Receipt-${ref}.pdf`;
}

/**
 * Fetches latest fresh data from Supabase for a booking with reliable individual queries
 */
export async function fetchLatestReceiptData(
  bookingId: string,
  fallbackBooking?: Partial<BookingData>
): Promise<{ booking: BookingData; settings: ResortSettings }> {
  // Resort settings defaults
  const settings: ResortSettings = {
    resort_name: "Punong Spring Resort",
    contact_number: "+63 912 062 7744",
    contact_email: "punongspringresort@gmail.com",
    address: "Brgy. Buburay, Dimataling, Zamboanga Del Sur, Philippines",
    business_hours: "8:00 AM - 6:00 PM (Daily)",
  };

  // If complete booking data is already provided in memory, use it directly!
  // This avoids redundant network latency and prevents the mobile browser's user gesture from expiring.
  if (fallbackBooking && fallbackBooking.id && fallbackBooking.guest_name && fallbackBooking.room) {
    return {
      booking: fallbackBooking as BookingData,
      settings,
    };
  }

  let booking: BookingData | null = null;

  try {
    // 1. Query booking directly
    const { data: bData, error: bErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();

    if (!bErr && bData) {
      // 2. Query room details
      let roomData = null;
      if (bData.room_id) {
        const { data: rData } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", bData.room_id)
          .maybeSingle();
        roomData = rData;
      }

      // 3. Query payments
      const { data: pData } = await supabase
        .from("payments")
        .select("*")
        .eq("booking_id", bData.id)
        .order("created_at", { ascending: false });

      booking = {
        ...(bData as unknown as BookingData),
        room: roomData || (fallbackBooking?.room ?? null),
        payments: pData || (fallbackBooking?.payments ?? []),
      };
    }
  } catch (err) {
    console.warn("DB fetch encountered an issue, will use fallback data:", err);
  }

  if (!booking) {
    if (fallbackBooking && fallbackBooking.id) {
      booking = fallbackBooking as BookingData;
    } else {
      throw new Error("Unable to locate reservation details.");
    }
  }

  try {
    const { data: sData } = await supabase
      .from("system_settings")
      .select("resort_name, contact_number, contact_email, address, business_hours")
      .eq("id", "default")
      .maybeSingle();

    if (sData) {
      settings.resort_name = sData.resort_name || settings.resort_name;
      settings.contact_number = sData.contact_number || settings.contact_number;
      settings.contact_email = sData.contact_email || settings.contact_email;
      settings.address = sData.address || settings.address;
      settings.business_hours = sData.business_hours || settings.business_hours;
    }
  } catch (e) {
    // Keep defaults
  }

  return { booking, settings };
}

/**
 * Calculates number of nights between two dates
 */
function calculateNights(checkIn: string, checkOut: string): number {
  try {
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    const diff = Math.ceil((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  } catch {
    return 1;
  }
}

/**
 * Formats date into readable string: "September 7, 2026"
 */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Universal cross-platform Blob downloader & mobile file saver
 * Works seamlessly on Android Chrome, iOS Safari, mobile WebViews, tablets, and desktop
 */
export async function triggerDirectBlobDownload(blob: Blob, filename: string): Promise<boolean> {
  try {
    const fileBlob = blob instanceof Blob ? blob : new Blob([blob], { type: "application/pdf" });
    const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // 1. Mobile Web Share API (Official standard for saving files on modern phones)
    // On Android & iOS, sharing a file opens the native system sheet where the user can
    // directly tap "Save to Files" (iOS) or "Save to device / Downloads / Drive" (Android).
    if (isMobile && typeof navigator !== "undefined" && typeof (navigator as any).canShare === "function") {
      try {
        const file = new File([fileBlob], filename, { type: "application/pdf" });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({
            files: [file],
            title: filename,
            text: "Punong Spring Resort Official Booking Receipt",
          });
          return true;
        }
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") {
          return true; // User intentionally dismissed share sheet
        }
        console.warn("Native share failed or not allowed, trying direct download fallback:", shareErr);
      }
    }

    // 2. Legacy IE/Edge support
    if (typeof (window.navigator as any)?.msSaveOrOpenBlob === "function") {
      (window.navigator as any).msSaveOrOpenBlob(fileBlob, filename);
      return true;
    }

    // 3. Blob URL creation
    const blobUrl = window.URL.createObjectURL(fileBlob);

    // 4. iOS Safari: does not support <a download> on blob URLs.
    // Opening the blob URL in a new tab allows iOS Safari to display the PDF directly,
    // where the user can view it and tap "Share -> Save to Files".
    if (isIOS) {
      const opened = window.open(blobUrl, "_blank");
      if (!opened) {
        window.location.href = blobUrl;
      }
      return true;
    }

    // 5. Android & Desktop: anchor download
    const anchor = document.createElement("a");
    anchor.style.position = "fixed";
    anchor.style.left = "-99999px";
    anchor.style.top = "-99999px";
    anchor.style.opacity = "0";
    anchor.href = blobUrl;
    anchor.setAttribute("download", filename);
    anchor.setAttribute("target", "_blank");
    anchor.rel = "noopener noreferrer";

    document.body.appendChild(anchor);
    anchor.click();

    setTimeout(() => {
      try {
        if (anchor.parentNode) {
          anchor.parentNode.removeChild(anchor);
        }
      } catch (e) {}
    }, 2000);

    // Keep blob URL alive for 2 minutes so Android download manager has plenty of time to finish
    setTimeout(() => {
      try {
        window.URL.revokeObjectURL(blobUrl);
      } catch (e) {}
    }, 120000);

    return true;
  } catch (err) {
    console.error("Direct blob download error:", err);
    return false;
  }
}

/**
 * Generates an official, high-resolution PDF receipt using jsPDF.
 * Uses clean vector rendering that will never clip or fail due to DOM/canvas limits.
 * Automatically downloads the PDF directly to customer device.
 */
export async function generateAndDownloadReceiptPdf(
  bookingId: string,
  initialBooking?: Partial<BookingData>
): Promise<boolean> {
  const toastId = toast.loading("Generating your official PDF receipt...");

  try {
    // 1. Fetch fresh DB records (or use initialBooking fallback)
    const { booking, settings } = await fetchLatestReceiptData(bookingId, initialBooking);

    // 2. Canonical reference and filename
    const reference = formatBookingReference(booking);
    const filename = getReceiptPdfFilename(booking);

    // 3. Extract calculations and metadata
    const nights = calculateNights(booking.check_in, booking.check_out);
    const totalAmount = Number(booking.total_amount) || 0;
    const isCottage = booking.room?.type === "cottage";
    const rawStayType = booking.stay_type ||
      (booking.special_requests?.toLowerCase().includes("overnight stay") || booking.special_requests?.toLowerCase().includes("overnight cottage fee")
        ? "overnight"
        : booking.special_requests?.toLowerCase().includes("day use")
        ? "day_use"
        : null);
    const isOvernightCottage = isCottage && (rawStayType === "overnight" || Number(booking.overnight_fee) > 0);
    const cottageOvernightFee = isCottage ? (isOvernightCottage ? (Number(booking.overnight_fee) || 1000) : 0) : 0;
    const stayTypeLabel = isOvernightCottage ? "Overnight Stay" : "Day Use";
    const roomPrice = Number(booking.room?.price) || (nights > 0 ? (totalAmount - cottageOvernightFee) / nights : totalAmount);
    const accommodationSubtotal = roomPrice * nights;

    const payment = booking.payments?.[0];
    let notes: any = {};
    if (payment?.notes) {
      try {
        notes = typeof payment.notes === "string" ? JSON.parse(payment.notes) : payment.notes;
      } catch (e) {
        notes = {};
      }
    }

    const isPaid = payment?.status === "verified";
    const isPending = !isPaid && payment?.status === "pending";
    const paymentMethodText = notes.method === "gcash" ? "GCash" : notes.method === "resort" ? "Pay at Resort (Front Desk)" : "Cash / Standard";
    const gcashRef = notes.ref || notes.referenceNumber || notes.reference || null;

    const issueDateStr = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // 4. Initialize jsPDF (A4 portrait, mm units)
    const doc = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    });

    const pageWidth = 210;
    const margin = 14;
    const contentWidth = pageWidth - margin * 2; // 182mm

    // ==========================================
    // SECTION 1: HEADER (Dark Slate with Gold Trim)
    // ==========================================
    doc.setFillColor(15, 23, 42); // #0F172A
    doc.rect(margin, 14, contentWidth, 34, "F");

    // Gold decorative stripe
    doc.setFillColor(212, 175, 55); // #D4AF37
    doc.rect(margin, 48, contentWidth, 1.8, "F");

    // Resort Branding
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text((settings.resort_name || "PUNONG SPRING RESORT").toUpperCase(), margin + 6, 24);

    doc.setTextColor(212, 175, 55);
    doc.setFontSize(7.5);
    doc.text("LUXURY NATURE SANCTUARY & FUNCTION HALL", margin + 6, 29);

    doc.setTextColor(148, 163, 184); // #94A3B8
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`${settings.address || "Brgy. Buburay, Dimataling, Zamboanga Del Sur, Philippines"}  |  ${settings.contact_number || "+63 917 123 4567"}`, margin + 6, 36);
    doc.text(`Email: ${settings.contact_email || "punongspringresort@gmail.com"}  |  Hours: ${settings.business_hours || "8:00 AM - 6:00 PM"}`, margin + 6, 40);

    // Header Right: Official Receipt Badge
    doc.setFillColor(212, 175, 55);
    doc.roundedRect(pageWidth - margin - 48, 19, 44, 7, 1.5, 1.5, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("OFFICIAL RECEIPT", pageWidth - margin - 26, 24, { align: "center" });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text(reference, pageWidth - margin - 4, 32, { align: "right" });

    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(`Issued: ${issueDateStr}`, pageWidth - margin - 4, 37, { align: "right" });

    // ==========================================
    // SECTION 2: GUEST & RESERVATION CARDS
    // ==========================================
    const cardY = 55;
    const cardHeight = 40;
    const cardWidth = 88;

    // Left Card: Guest Information
    doc.setFillColor(248, 250, 252); // #F8FAFC
    doc.setDrawColor(226, 232, 240); // #E2E8F0
    doc.roundedRect(margin, cardY, cardWidth, cardHeight, 2, 2, "FD");

    doc.setTextColor(179, 135, 40); // Gold
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("GUEST INFORMATION", margin + 5, cardY + 7);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10.5);
    doc.text(booking.guest_name || "Valued Guest", margin + 5, cardY + 14);

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`Email: ${booking.guest_email || "N/A"}`, margin + 5, cardY + 20);
    doc.text(`Phone: ${booking.guest_phone || "N/A"}`, margin + 5, cardY + 25);

    if (booking.special_requests) {
      const truncatedRequest = booking.special_requests.length > 42 
        ? booking.special_requests.substring(0, 39) + "..." 
        : booking.special_requests;
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(`Request: ${truncatedRequest}`, margin + 5, cardY + 31);
    }

    // Right Card: Reservation Summary
    const rightCardX = margin + cardWidth + 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(rightCardX, cardY, cardWidth, cardHeight, 2, 2, "FD");

    doc.setTextColor(179, 135, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("STAY SUMMARY", rightCardX + 5, cardY + 7);

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Check-In Date:", rightCardX + 5, cardY + 14);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(formatDate(booking.check_in), rightCardX + cardWidth - 5, cardY + 14, { align: "right" });

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.text("Check-Out Date:", rightCardX + 5, cardY + 20);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(formatDate(booking.check_out), rightCardX + cardWidth - 5, cardY + 20, { align: "right" });

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.text("Stay Duration:", rightCardX + 5, cardY + 26);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(isCottage ? `${nights} Day${nights > 1 ? "s" : ""}` : `${nights} Night${nights > 1 ? "s" : ""}`, rightCardX + cardWidth - 5, cardY + 26, { align: "right" });

    if (isCottage) {
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "normal");
      doc.text("Stay Type:", rightCardX + 5, cardY + 32);
      doc.setTextColor(179, 135, 40); // Gold
      doc.setFont("helvetica", "bold");
      doc.text(stayTypeLabel, rightCardX + cardWidth - 5, cardY + 32, { align: "right" });
    } else {
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "normal");
      doc.text("Total Guests:", rightCardX + 5, cardY + 32);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(`${booking.guests} Guest${booking.guests > 1 ? "s" : ""}`, rightCardX + cardWidth - 5, cardY + 32, { align: "right" });
    }

    // ==========================================
    // SECTION 3: CHARGES TABLE
    // ==========================================
    const tableY = 103;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, tableY, contentWidth, 8, 1, 1, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("ITEM / ACCOMMODATION", margin + 6, tableY + 5.5);
    doc.text("TYPE", margin + 85, tableY + 5.5);
    doc.text(isCottage ? "RATE / DAY" : "RATE / NIGHT", margin + 122, tableY + 5.5, { align: "center" });
    doc.text(isCottage ? "DAYS" : "NIGHTS", margin + 148, tableY + 5.5, { align: "center" });
    doc.text("AMOUNT (PHP)", pageWidth - margin - 6, tableY + 5.5, { align: "right" });

    // Table Content Row 1: Accommodation
    const rowY = tableY + 16;
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    const roomName = booking.room?.name || "Resort Accommodation";
    doc.text(roomName, margin + 6, rowY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    const roomType = booking.room?.type === "villa" ? "Function Hall" : (booking.room?.type || "Room");
    doc.text(roomType.toUpperCase(), margin + 85, rowY);

    doc.setTextColor(51, 65, 85);
    doc.text(`PHP ${roomPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 122, rowY, { align: "center" });
    doc.text(String(nights), margin + 148, rowY, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9.5);
    const itemAmount = isCottage ? accommodationSubtotal : totalAmount;
    doc.text(`PHP ${itemAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 6, rowY, { align: "right" });

    let finalRowY = rowY;
    if (isOvernightCottage) {
      finalRowY = rowY + 7;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(8.5);
      doc.text("Overnight Cottage Fee", margin + 6, finalRowY);
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("ONE-TIME FEE", margin + 85, finalRowY);
      doc.setTextColor(51, 65, 85);
      doc.text("PHP 1,000.00", margin + 122, finalRowY, { align: "center" });
      doc.text("1", margin + 148, finalRowY, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(8.5);
      doc.text("PHP 1,000.00", pageWidth - margin - 6, finalRowY, { align: "right" });
    }

    // Table divider line
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, finalRowY + 6, pageWidth - margin, finalRowY + 6);

    // ==========================================
    // SECTION 4: PAYMENT & FINANCIAL SUMMARY
    // ==========================================
    const summaryY = 132;
    const summaryHeight = 44;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, summaryY, contentWidth, summaryHeight, 2, 2, "FD");

    // Left summary: Payment verification
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("PAYMENT CONFIRMATION", margin + 6, summaryY + 8);

    // Badge Pill
    const badgeColor = isPaid ? [21, 128, 61] : isPending ? [180, 83, 9] : [220, 38, 38];
    doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.roundedRect(margin + 6, summaryY + 11, 62, 6, 1.5, 1.5, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const badgeLabel = isPaid ? "PAID IN FULL" : isPending ? "RESERVED (PAY AT RESORT)" : "UNPAID";
    doc.text(badgeLabel, margin + 37, summaryY + 15.2, { align: "center" });

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`Payment Method: ${paymentMethodText}`, margin + 6, summaryY + 23);
    if (gcashRef) {
      doc.text(`GCash Reference: ${gcashRef}`, margin + 6, summaryY + 28);
    }
    const statusText = booking.status === "approved" ? "Confirmed" : booking.status;
    doc.text(`Booking Status: ${statusText.toUpperCase()}`, margin + 6, summaryY + (gcashRef ? 33 : 28));

    // Right summary: Financial breakdown
    const splitX = pageWidth - margin - 72;
    const balanceDue = isPaid ? 0 : totalAmount;

    if (isCottage) {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text("Accommodation Subtotal:", splitX, summaryY + 7);
      doc.setTextColor(15, 23, 42);
      doc.text(`PHP ${accommodationSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 6, summaryY + 7, { align: "right" });

      doc.setTextColor(100, 116, 139);
      doc.text("Overnight Cottage Fee:", splitX, summaryY + 12);
      doc.setTextColor(isOvernightCottage ? 179 : 15, isOvernightCottage ? 135 : 23, isOvernightCottage ? 40 : 42);
      doc.text(`PHP ${cottageOvernightFee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 6, summaryY + 12, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.line(splitX, summaryY + 16, pageWidth - margin - 6, summaryY + 16);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Total Stay Price:", splitX, summaryY + 23);
      doc.setTextColor(179, 135, 40); // Gold
      doc.text(`PHP ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 6, summaryY + 23, { align: "right" });

      doc.setFontSize(8.5);
      doc.setTextColor(isPaid ? 21 : 180, isPaid ? 128 : 83, isPaid ? 61 : 9);
      doc.text("Balance Due:", splitX, summaryY + 29);
      doc.text(`PHP ${balanceDue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 6, summaryY + 29, { align: "right" });
    } else {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7.5);
      doc.text("Subtotal:", splitX, summaryY + 9);
      doc.setTextColor(15, 23, 42);
      doc.text(`PHP ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 6, summaryY + 9, { align: "right" });

      doc.setTextColor(100, 116, 139);
      doc.text("Taxes & Resort Fees:", splitX, summaryY + 15);
      doc.setTextColor(15, 23, 42);
      doc.text("PHP 0.00 (Included)", pageWidth - margin - 6, summaryY + 15, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.line(splitX, summaryY + 18, pageWidth - margin - 6, summaryY + 18);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text("Total Stay Price:", splitX, summaryY + 25);
      doc.setTextColor(179, 135, 40); // Gold
      doc.text(`PHP ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 6, summaryY + 25, { align: "right" });

      doc.setFontSize(8.5);
      doc.setTextColor(isPaid ? 21 : 180, isPaid ? 128 : 83, isPaid ? 61 : 9);
      doc.text("Balance Due:", splitX, summaryY + 31);
      doc.text(`PHP ${balanceDue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 6, summaryY + 31, { align: "right" });
    }

    // ==========================================
    // SECTION 5: VERIFICATION SEAL & SECURITY HASH
    // ==========================================
    const sealY = 186;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, sealY, pageWidth - margin, sealY);

    // Gold circle seal
    doc.setFillColor(254, 252, 232); // #FEFCE8
    doc.setDrawColor(212, 175, 55);
    doc.circle(margin + 7, sealY + 9, 6, "FD");

    doc.setTextColor(179, 135, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("✓", margin + 7, sealY + 12.5, { align: "center" });

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("VERIFIED OFFICIAL GUEST RECEIPT", margin + 17, sealY + 7.5);

    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text("Authenticated through Punong Spring Resort Central Database & Reservation Management System", margin + 17, sealY + 12);

    const hashStr = (booking.id || "").replace(/-/g, "").toUpperCase().slice(0, 16);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(6.5);
    doc.text(`SECURITY HASH: ${hashStr || "PRS2026OFFICIAL"}`, pageWidth - margin, sealY + 10, { align: "right" });

    // ==========================================
    // SECTION 6: POLICIES & FOOTER NOTICE
    // ==========================================
    const footerY = 210;
    doc.setFillColor(241, 245, 249); // #F1F5F9
    doc.roundedRect(margin, footerY, contentWidth, 20, 2, 2, "F");

    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("Thank you for reserving your getaway with Punong Spring Resort!", pageWidth / 2, footerY + 6.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6.8);
    doc.text("Standard Check-In Time: 2:00 PM  |  Standard Check-Out Time: 12:00 PM", pageWidth / 2, footerY + 11.5, { align: "center" });
    doc.text("Please present a valid government-issued ID upon arrival at the front desk along with this receipt.", pageWidth / 2, footerY + 15.5, { align: "center" });

    // 5. Generate output blob and trigger direct download
    const pdfBlob = doc.output("blob");
    const downloaded = await triggerDirectBlobDownload(pdfBlob, filename);

    if (!downloaded) {
      // Fallback to jsPDF save
      doc.save(filename);
    }

    const isMobileDevice = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobileDevice) {
      toast.success("Receipt ready! Check your Downloads or Files app.", { id: toastId, duration: 4000 });
    } else {
      toast.success("Receipt downloaded successfully!", { id: toastId });
    }
    return true;
  } catch (err: any) {
    console.error("Receipt PDF Generation Error:", err);
    // Strict requirement: NEVER call window.print()
    toast.error("Failed to generate PDF receipt. Please try again.", { id: toastId });
    return false;
  }
}
