import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import {
  Eye,
  CheckCircle2,
  XCircle,
  Banknote,
  CreditCard,
  Search,
  CalendarClock,
  Trash2,
  RotateCcw,
  Loader2,
  Lock,
  Check,
  Clock,
  UserX,
  User,
  Mail,
  Phone,
  Calendar,
  Copy,
  Info,
  AlertCircle,
  BedDouble,
} from "lucide-react";

import { processAutoBookingStatuses, getPhilippineTime, isOvernightCottage } from "@/lib/booking-utils";
import { autoCompleteBookingsServerFn, undoPaymentServerFn } from "@/lib/api/booking.functions";
import { trashService } from "@/lib/recently-deleted";
import { cn } from "@/lib/utils";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsTab,
});

/**
 * Format timestamp nicely (e.g. "October 23, 2026, 7:20 PM")
 */
function formatCancellationTimestamp(dateVal?: string | null): string {
  if (!dateVal) return "Unknown";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Manila",
    }).format(d);
  } catch (e) {
    return String(dateVal);
  }
}

/**
 * Retrieves the cancellation reason from database record with fallbacks
 */
function getCancellationReason(b: any, notes: any): string {
  const raw = (b?.cancellation_reason || notes?.cancellation_reason || "").trim();
  if (raw) return raw;
  if (b?.status === "rejected") return "Booking rejected by resort admin";
  return "No specific reason was provided";
}

/**
 * Accurately determines who initiated the cancellation:
 * - Customer cancels their own booking -> Customer
 * - Admin manually cancels a booking -> Admin
 * - Automated system process cancels a booking -> System
 */
function getCancellationActor(b: any, notes: any): "Customer" | "Admin" | "System" | "System/Admin" {
  const rawActor = (b?.cancelled_by || notes?.cancelled_by || "").trim().toLowerCase();
  if (rawActor === "customer") return "Customer";
  if (rawActor === "admin") return "Admin";
  if (rawActor === "system") return "System";

  const rawActorName = (b?.cancelled_by_name || notes?.cancelled_by_name || "").trim().toLowerCase();
  if (rawActorName === "customer" || rawActorName.includes("customer")) return "Customer";
  if (rawActorName === "admin" || rawActorName.includes("admin")) return "Admin";
  if (rawActorName === "system" || rawActorName.includes("system")) return "System";

  // Unverified historical legacy records
  return "System/Admin";
}

function BookingsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const s = params.get("status");
      if (s && ["all", "approved", "completed", "no-show", "cancelled", "pending-booking"].includes(s)) {
        return s;
      }
    }
    return "all";
  });
  const [selectedCancelledBooking, setSelectedCancelledBooking] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("Booking ID copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStatusFilterChange = (newVal: string) => {
    setStatusFilter(newVal);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (newVal === "all") {
        url.searchParams.delete("status");
      } else {
        url.searchParams.set("status", newVal);
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-bookings-unified"],
    queryFn: async () => {
      // 1. Trigger server-side automatic booking completion based on Philippine Time
      try {
        await autoCompleteBookingsServerFn();
      } catch (e) {
        console.warn("Server auto-completion trigger error:", e);
      }

      // 2. Query bookings from database
      const { data, error } = await supabase
        .from("bookings")
        .select("*, room:rooms(name, type, price), profile:profiles!bookings_user_id_fkey(fullname,email,phone), payments(id, amount, status, notes, receipt_url)")
        .order("created_at", { ascending: false });

      let activeList: any[] = [];

      if (error) {
        console.warn("Primary bookings query error, trying fallback query:", error);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("bookings")
          .select("*, room:rooms(name, type, price), payments(id, amount, status, notes, receipt_url)")
          .order("created_at", { ascending: false });

        if (fallbackError) {
          console.error("Fallback bookings query error:", fallbackError);
          throw fallbackError;
        }

        activeList = (fallbackData || []).filter((b: any) => !b.deleted_at);
      } else {
        activeList = (data || []).filter((b: any) => !b.deleted_at);
      }

      // 3. Ensure profiles are safely enriched for any user_id where profile is not joined
      const missingProfileUserIds = [...new Set(activeList.filter((b: any) => b.user_id && !b.profile).map((b: any) => b.user_id))];
      if (missingProfileUserIds.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, fullname, email, phone")
            .in("id", missingProfileUserIds);
          if (profiles) {
            const map = Object.fromEntries(profiles.map((p: any) => [p.id, p]));
            activeList.forEach((b: any) => {
              if (b.user_id && !b.profile && map[b.user_id]) {
                b.profile = map[b.user_id];
              }
            });
          }
        } catch (e) {
          console.warn("Could not enrich missing profiles:", e);
        }
      }

      if (activeList.length > 0) {
        await processAutoBookingStatuses(activeList);
      }

      return activeList;
    },
  });

  // Summary stats for Cancelled Bookings view
  const cancellationStats = useMemo(() => {
    const cancelledList = bookings.filter((b: any) => b.status === "cancelled" || b.status === "rejected");
    let customerWithReason = 0;

    cancelledList.forEach((b: any) => {
      const p = b.payments?.[0];
      let notes: any = {};
      try {
        if (p?.notes) notes = JSON.parse(p.notes);
      } catch (e) {}

      const reason = (b.cancellation_reason || notes.cancellation_reason || "").trim();
      if (reason) customerWithReason++;
    });

    return {
      total: cancelledList.length,
      customerWithReason,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b: any) => {
      let notes: any = {};
      const p = b.payments?.[0];
      try { if (p?.notes) notes = JSON.parse(p.notes); } catch(e){}

      // 1. Status Filter
      if (statusFilter !== "cancelled") {
        // Always hide cancelled/rejected from standard views ("all", "approved", "completed", "no-show")
        if (b.status === "cancelled" || b.status === "rejected") return false;

        if (statusFilter !== "all") {
          if (statusFilter === "pending-booking" && b.status !== "pending") return false;
          if (statusFilter === "approved" && b.status !== "approved") return false;
          if (statusFilter === "completed" && b.status !== "completed") return false;
          if (statusFilter === "no-show" && b.status !== "no-show") return false;
        }

        // Standard Search Filter (Customer Name, Booking ID, Ref Number, Email)
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const guestMatch = (b.guest_name || b.profile?.fullname || "").toLowerCase().includes(term);
          const idMatch = b.id?.toLowerCase().includes(term);
          const emailMatch = (b.guest_email || b.profile?.email || "").toLowerCase().includes(term);
          const roomMatch = b.room?.name?.toLowerCase().includes(term);
          if (!guestMatch && !idMatch && !emailMatch && !roomMatch) return false;
        }
      } else {
        // Cancelled Bookings Filter: strictly cancelled or rejected bookings
        if (b.status !== "cancelled" && b.status !== "rejected") return false;

        // Comprehensive Cancelled Search Filter (Customer Name, Email, Phone, ID, Room, Reason, Actor)
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const customerName = (b.guest_name || b.profile?.fullname || notes.cancelled_by_name || "").toLowerCase();
          const customerEmail = (b.guest_email || b.profile?.email || "").toLowerCase();
          const customerPhone = (b.guest_phone || b.profile?.phone || "").toLowerCase();
          const idMatch = b.id?.toLowerCase().includes(term);
          const roomMatch = b.room?.name?.toLowerCase().includes(term);
          const reasonMatch = (b.cancellation_reason || notes.cancellation_reason || "").toLowerCase().includes(term);
          const actorMatch = (b.cancelled_by || notes.cancelled_by || b.cancelled_by_name || "").toLowerCase().includes(term);

          if (
            !customerName.includes(term) &&
            !customerEmail.includes(term) &&
            !customerPhone.includes(term) &&
            !idMatch &&
            !roomMatch &&
            !reasonMatch &&
            !actorMatch
          ) {
            return false;
          }
        }
      }

      return true;
    });
  }, [bookings, searchTerm, statusFilter]);

  async function updateBookingStatus(
    id: string,
    status: "pending" | "approved" | "rejected" | "cancelled" | "completed" | "no-show",
  ) {
    const targetBooking = bookings.find((b: any) => b.id === id);
    if (targetBooking?.status === "completed" && status !== "completed") {
      toast.error("A completed booking cannot be reverted to a previous status.");
      return MySwal.fire({
        title: "Action Blocked",
        text: "A completed booking cannot be reverted to a previous status.",
        icon: "error",
        confirmButtonColor: "#d33",
      });
    }

    let adminReason = "";
    if (status === "rejected" || status === "cancelled") {
      const result = await MySwal.fire({
        title: status === "rejected" ? "Reject Reservation" : "Cancel Reservation",
        text: `Are you sure you want to ${status === "rejected" ? "reject" : "cancel"} this reservation? You may provide a reason:`,
        input: "text",
        inputPlaceholder: status === "rejected" ? "Reason for rejection (e.g. Duplicate booking, policy violation)..." : "Reason for cancellation...",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#64748b",
        confirmButtonText: `Yes, ${status === "rejected" ? "reject" : "cancel"}!`,
      });
      if (!result.isConfirmed) return;
      adminReason = (result.value || "").trim();
    } else {
      const result = await MySwal.fire({
        title: "Are you sure?",
        text: `Do you want to mark this booking as ${status}?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, proceed!",
      });
      if (!result.isConfirmed) return;
    }

    const nowIso = new Date().toISOString();
    const adminActorName = user?.user_metadata?.fullname || user?.email || "Resort Admin";

    const updatePayload: any = { status };
    if (status === "cancelled" || status === "rejected") {
      updatePayload.cancelled_at = nowIso;
      updatePayload.cancelled_by = "Admin";
      updatePayload.cancelled_by_name = adminActorName;
      updatePayload.cancellation_reason = adminReason || (status === "rejected" ? "Booking rejected by resort admin" : "Cancelled by resort admin");
    }

    let updatedBooking: any = null;
    const { data: updData, error } = await supabase
      .from("bookings")
      .update(updatePayload)
      .eq("id", id)
      .select("*, room:rooms(name, type)")
      .single();

    if (error) {
      console.warn("Update with cancellation fields had notice, trying fallback status update:", error.message);
      const { data: fallbackData, error: fbErr } = await supabase
        .from("bookings")
        .update({ status })
        .eq("id", id)
        .select("*, room:rooms(name, type)")
        .single();
      if (fbErr) return MySwal.fire("Error!", fbErr.message, "error");
      updatedBooking = fallbackData;
    } else {
      updatedBooking = updData;
    }

    // Also update associated payment notes for backwards-compatibility
    if (status === "cancelled" || status === "rejected") {
      try {
        const payment = targetBooking?.payments?.[0];
        if (payment?.id) {
          let parsedNotes: any = {};
          try { parsedNotes = JSON.parse(payment.notes || "{}"); } catch(e){}
          parsedNotes.cancellation_reason = updatePayload.cancellation_reason;
          parsedNotes.cancellation_date = nowIso;
          parsedNotes.cancelled_by = "Admin";
          parsedNotes.cancelled_by_name = adminActorName;
          await supabase.from("payments").update({
            notes: JSON.stringify(parsedNotes)
          }).eq("id", payment.id);
        }
      } catch (payErr) {
        console.warn("Payment notes update on admin cancellation:", payErr);
      }
    }

    // Trigger status update email notification asynchronously without blocking booking update
    if (updatedBooking) {
      supabase.functions
        .invoke("booking-emails", {
          body: { emailType: "status_update", bookingData: updatedBooking },
        })
        .then((res: { error: Error | null }) => {
          if (res.error) {
            console.warn("Email notification failed:", res.error.message);
            toast.warning("Booking updated, but email notification could not be sent.");
          } else {
            toast.success("Email notification sent successfully!");
          }
        })
        .catch((err: Error) => {
          console.warn("Email system error:", err.message);
          toast.warning("Booking updated, but email notification could not be sent.");
        });
    }

    MySwal.fire("Updated!", `Booking has been ${status}.`, "success");
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["admin-cancellations"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
    qc.invalidateQueries({ queryKey: ["pending-payments-count"] });
  }

  async function updatePaymentStatus(bookingId: string, userId: string, paymentId: string | undefined, status: string, totalAmount: number) {
    if (paymentId) {
      const { error } = await supabase
        .from("payments")
        .update({ status, ...(status === "verified" && totalAmount > 0 ? { amount: totalAmount } : {}) })
        .eq("id", paymentId);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("payments").insert({
        booking_id: bookingId,
        user_id: userId,
        amount: totalAmount,
        status,
        notes: JSON.stringify({ method: "resort" })
      });
      if (error) return toast.error(error.message);
    }

    // Preserve completed booking status: never overwrite or revert a completed booking
    const { data: b } = await supabase.from("bookings").select("status, check_out").eq("id", bookingId).single();
    if (b) {
      if (b.status === "completed") {
        // Do NOT modify status for completed bookings
      } else if (b.status === "no-show" && status === "verified") {
        const { dateStr: today } = getPhilippineTime();
        const newStatus = b.check_out < today ? "completed" : "approved";
        await supabase.from("bookings").update({ status: newStatus }).eq("id", bookingId);
      }
    }

    toast.success(`Payment marked as ${status}`);
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
  }

  async function undoPaymentStatus(bookingId: string, paymentId: string, currentStatus: string) {
    if (!user) return;

    // Strict frontend barrier: completed bookings cannot undo payment
    const targetBooking = bookings.find((b: any) => b.id === bookingId);
    if (targetBooking?.status === "completed") {
      toast.error("Payment cannot be undone because this booking is already completed.");
      return MySwal.fire({
        title: "Action Blocked",
        text: "Payment cannot be undone because this booking is already completed.",
        icon: "error",
        confirmButtonColor: "#d33",
      });
    }

    const result = await MySwal.fire({
      title: "Undo Payment?",
      text: "Are you sure you want to revert this payment to Unpaid?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#f97316",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, revert to Unpaid",
    });

    if (!result.isConfirmed) return;

    // Strict backend enforcement via server function
    const res = await undoPaymentServerFn({
      data: {
        bookingId,
        paymentId,
        adminId: user.id,
      },
    });

    if (!res.success) {
      toast.error(res.error || "Payment cannot be undone.");
      return MySwal.fire({
        title: "Action Blocked",
        text: res.error || "Payment cannot be undone because this booking is already completed.",
        icon: "error",
        confirmButtonColor: "#d33",
      });
    }

    MySwal.fire("Reverted!", "Payment status has been reverted to Unpaid.", "success");
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  }

  async function markNoShow(bookingId: string, paymentId?: string, isResort?: boolean) {
    const result = await MySwal.fire({
      title: "Mark as No-Show?",
      text: "The guest failed to arrive. Do you want to mark this reservation as No-Show?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#f97316",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, mark No-Show!",
    });

    if (!result.isConfirmed) return;

    // Update booking status
    const { error: bErr } = await supabase.from("bookings").update({ status: "no-show" }).eq("id", bookingId);
    if (bErr) return toast.error(bErr.message);

    // If pay-at-resort, ensure payment record is marked as unpaid
    if (paymentId && isResort) {
      await supabase.from("payments").update({ status: "unpaid" }).eq("id", paymentId);
    }

    MySwal.fire("Updated!", "Booking has been marked as No-Show.", "success");
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
  }

  async function deleteBooking(id: string) {
    const targetBooking = bookings.find((b: any) => b.id === id);
    const guestName = targetBooking?.guest_name || "this booking reservation";

    const result = await MySwal.fire({
      title: "Move to Recently Deleted?",
      text: `Are you sure you want to delete reservation for "${guestName}"? You can restore it anytime from Recently Deleted in Admin Reports.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, move to trash",
    });

    if (!result.isConfirmed) return;

    if (targetBooking) {
      await trashService.recordDeleted({
        id: id,
        type: "booking",
        title: targetBooking.guest_name || "Reservation",
        subtitle: targetBooking.room?.name
          ? `${targetBooking.room.name} (${targetBooking.room.type?.toUpperCase()})`
          : `Booking #${id.slice(0, 8)}`,
        description: `${targetBooking.guest_email || "No email"} • ${targetBooking.guest_phone || "No phone"} • ${targetBooking.guests || 1} guest(s)`,
        amount: targetBooking.total_amount,
        dates: `${targetBooking.check_in} → ${targetBooking.check_out}`,
        data: targetBooking,
        deleted_by: user?.id,
        deleted_by_name: user?.user_metadata?.fullname || user?.email,
      });
    }

    const { error } = await supabase
      .from("bookings")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return MySwal.fire("Error!", error.message, "error");

    MySwal.fire("Moved to Trash!", "Booking reservation moved to Recently Deleted.", "success");
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["admin-cancellations"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
    qc.invalidateQueries({ queryKey: ["reports-bookings-all"] });
    qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
  }

  async function viewReceipt(urlOrPath: string) {
    if (urlOrPath.startsWith("http")) {
      window.open(urlOrPath, "_blank");
    } else {
      const { data } = await supabase.storage.from("receipts").createSignedUrl(urlOrPath, 60);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  }

  const isCancelledView = statusFilter === "cancelled";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            {isCancelledView ? (
              <span className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-[10px] uppercase tracking-wider border border-rose-200 dark:border-rose-800/60">
                Audit & Cancellation Log
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] dark:text-[#FACC15] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
                Reservation Control
              </span>
            )}
            <span className="text-xs text-slate-400 dark:text-slate-400 font-medium">
              ({filteredBookings.length} {isCancelledView ? "Record" : "Active Booking"}{filteredBookings.length === 1 ? '' : 's'})
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display tracking-tight mt-1">
            {isCancelledView ? "Cancelled Bookings & Customers" : "Bookings & Payment Ledger"}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isCancelledView
              ? "View customer details for cancelled reservations, review stated cancellation reasons, and track audit history."
              : "Verify GCash receipts, update stay statuses, and manage guest reservations."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={isCancelledView ? "Search Customer, Email, Phone, Reason..." : "Search Name, ID, or Ref No..."}
              className="pl-9 h-10 border-slate-200 dark:border-slate-700 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] bg-slate-50/50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 rounded-xl transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-full md:w-52 h-10 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100">
              <SelectValue placeholder="Status Filter" />
            </SelectTrigger>
            <SelectContent className="dark:bg-[#1E293B] dark:border-slate-700 dark:text-slate-100">
              <SelectItem value="all">All Bookings</SelectItem>
              <SelectItem value="approved">Confirmed Bookings</SelectItem>
              <SelectItem value="completed">Completed Bookings</SelectItem>
              <SelectItem value="no-show">No-Show Bookings</SelectItem>
              <SelectItem value="cancelled">Cancelled Bookings</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards — ONLY shown when Cancelled Bookings is selected */}
      {isCancelledView && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 bg-white dark:bg-[#151F2E] border-slate-200/80 dark:border-slate-800 shadow-xs rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Cancelled
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {cancellationStats.total}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Historical cancellations</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <XCircle className="w-5 h-5" />
            </div>
          </Card>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-[#151F2E]">
        {isCancelledView ? (
          /* ========================================================================= */
          /* CANCELLED BOOKINGS MANAGEMENT INTERFACE                                 */
          /* ========================================================================= */
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-slate-800/60">
              <TableRow className="border-b border-slate-200/80 dark:border-slate-800">
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">
                  Customer Who Cancelled
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">
                  Room & Reservation
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">
                  Cancellation Reason & Details
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4 text-right pr-6">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-40 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
                      <p className="text-xs uppercase tracking-widest font-semibold text-slate-500 dark:text-slate-400">
                        Loading cancelled bookings log...
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-40 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <XCircle className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No cancelled reservations found.</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {searchTerm ? "Try searching with a different term." : "Any cancellations made by guests or administrators will appear here."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredBookings.map((b: any) => {
                  const p = b.payments?.[0];
                  let notes: any = {};
                  try {
                    if (p?.notes) notes = JSON.parse(p.notes);
                  } catch (e) {}

                  const customerName = b.guest_name || b.profile?.fullname || notes.cancelled_by_name || "Guest Customer";
                  const customerEmail = b.guest_email || b.profile?.email || "No email";
                  const customerPhone = b.guest_phone || b.profile?.phone || "No contact number";
                  const initial = customerName.charAt(0).toUpperCase();

                  const cancellationReason = getCancellationReason(b, notes);
                  const cancellationActor = getCancellationActor(b, notes);
                  const cancelDate = b.cancelled_at || notes.cancellation_date || b.updated_at || b.created_at;

                  return (
                    <TableRow
                      key={b.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800 cursor-pointer"
                      onClick={() => setSelectedCancelledBooking(b)}
                    >
                      {/* Customer Column */}
                      <TableCell className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-900 to-slate-800 text-[#D4AF37] border border-[#D4AF37]/30 flex items-center justify-center font-bold text-sm shrink-0 shadow-md">
                            {initial}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm hover:text-[#D4AF37] dark:hover:text-[#FACC15] transition-colors">
                                {customerName}
                              </span>
                              {cancellationActor === "Customer" ? (
                                <Badge className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/60 hover:bg-amber-100 text-[10px] px-1.5 py-0 font-bold">
                                  Customer Cancelled
                                </Badge>
                              ) : cancellationActor === "Admin" ? (
                                <Badge className="bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700/60 hover:bg-rose-100 text-[10px] px-1.5 py-0 font-bold">
                                  Admin Cancelled
                                </Badge>
                              ) : cancellationActor === "System" ? (
                                <Badge className="bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-700/60 hover:bg-sky-100 text-[10px] px-1.5 py-0 font-bold">
                                  System Cancelled
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-slate-500 dark:text-slate-400 dark:border-slate-700 text-[10px] px-1.5 py-0">
                                  {b.status === "rejected" ? "Admin Rejected" : "Cancelled"}
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {customerEmail}
                              </span>
                              {customerPhone !== "No contact number" && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  {customerPhone}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 pt-0.5">
                              <span className="text-[11px] text-slate-400 font-mono">ID:</span>
                              <button
                                onClick={(e) => handleCopyId(b.id, e)}
                                className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold transition-colors"
                                title="Click to copy full ID"
                              >
                                {b.id.slice(0, 8)}...
                                {copiedId === b.id ? (
                                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-400" />
                                )}
                              </button>
                              <span className="text-[11px] font-semibold text-[#B38728] dark:text-[#FACC15]">
                                • ₱{Number(b.total_amount || 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Room & Stay Dates Column */}
                      <TableCell className="py-4">
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                            <BedDouble className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>{b.room?.name || "Unassigned Room"}</span>
                            {b.room?.type && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {b.room.type === "villa" ? "Function Hall" : b.room.type}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-700 dark:text-slate-300">{b.check_in}</span>
                            <span className="text-slate-300 dark:text-slate-600">→</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{b.check_out}</span>
                            <span className="text-slate-400">({b.guests} guest{b.guests > 1 ? "s" : ""})</span>
                          </div>

                          {p && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 pt-0.5">
                              <span className="uppercase font-semibold text-slate-600 dark:text-slate-400">
                                Payment: {notes.method === "gcash" ? "GCash" : "Pay at Resort"}
                              </span>
                              {p.status === "refund_pending" && (
                                <Badge className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700/60 text-[10px] px-1.5 py-0">
                                  Refund Pending
                                </Badge>
                              )}
                              {p.status === "refunded" && (
                                <Badge className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/60 text-[10px] px-1.5 py-0">
                                  Refunded
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Cancellation Reason & Date */}
                      <TableCell className="py-4">
                        <div className="space-y-1.5">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 text-xs font-medium max-w-md">
                            <Info className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                            <span className="font-semibold text-rose-900 dark:text-rose-200">Reason:</span>
                            <span className="truncate">{cancellationReason}</span>
                          </div>

                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pl-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Cancelled:</span>
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {formatCancellationTimestamp(cancelDate)}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 dark:text-slate-400 pl-1">
                            Cancellation Action By: <span className={cn(
                              "font-semibold",
                              cancellationActor === "Customer" ? "text-amber-700 dark:text-amber-400" :
                              cancellationActor === "Admin" ? "text-rose-700 dark:text-rose-400" :
                              cancellationActor === "System" ? "text-sky-700 dark:text-sky-400" :
                              "text-slate-700 dark:text-slate-200"
                            )}>{cancellationActor}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Action */}
                      <TableCell className="py-4 text-right pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCancelledBooking(b);
                            }}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-[#D4AF37]" /> View Details
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBooking(b.id);
                            }}
                            className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40"
                            title="Move to Recently Deleted"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        ) : (
          /* ========================================================================= */
          /* STANDARD BOOKINGS & PAYMENT LEDGER INTERFACE                             */
          /* ========================================================================= */
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-slate-800/60">
              <TableRow className="border-b border-slate-200/80 dark:border-slate-800">
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Guest & Booking ID</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Room & Dates</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Total Amount</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Payment Method</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Status</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4 text-right pr-6">Quick Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
                      <p className="text-xs uppercase tracking-widest font-semibold text-slate-500 dark:text-slate-400">
                        Loading reservations ledger...
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <CalendarClock className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No bookings found matching your search or status filter.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredBookings.map((b: any) => {
                  const p = b.payments?.[0];
                  let notes: any = {};
                  try { if (p?.notes) notes = JSON.parse(p.notes); } catch (e) {}

                  const isGcash = notes.method === "gcash";
                  const isResort = notes.method === "resort";
                  const initial = b.guest_name ? b.guest_name[0].toUpperCase() : "G";

                  const isCottage = b.room?.type === "cottage";
                  const isOvernight = isOvernightCottage(b);
                  const cottageOvernightFee = isCottage ? (isOvernight ? (Number(b.overnight_fee) || 1000) : 0) : 0;
                  const stayTypeLabel = isOvernight ? "Overnight Stay" : "Day Use";
                  const totalAmount = Number(b.total_amount) || 0;
                  const accommodationSubtotal = isCottage ? Math.max(0, totalAmount - cottageOvernightFee) : totalAmount;

                  return (
                    <TableRow key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800">
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-900 to-slate-800 text-[#D4AF37] flex items-center justify-center font-bold text-sm shrink-0 ring-2 ring-[#D4AF37]/30 shadow-md">
                            {initial}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{b.guest_name}</div>
                            <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
                              ID: <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-600 dark:text-slate-300 font-semibold">{b.id.split("-")[0]}</span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{b.guest_email}</div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                          {b.room?.name || "Room"}
                          {b.room?.type && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {b.room.type === "villa" ? "Function Hall" : b.room.type}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{b.check_in}</span> 
                          <span className="text-slate-300 dark:text-slate-600">→</span> 
                          <span className="font-medium text-slate-700 dark:text-slate-300">{b.check_out}</span>
                        </div>
                        {isCottage && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">Stay Type:</span>
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                              isOvernight 
                                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            )}>
                              {stayTypeLabel}
                            </span>
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="font-display font-extrabold text-[#B38728] dark:text-[#FACC15] text-base">
                          ₱{totalAmount.toLocaleString()}
                        </div>
                        {isCottage ? (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5 border-t border-slate-100 dark:border-slate-800 pt-1">
                            <div className="flex justify-between gap-2">
                              <span>Subtotal:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">₱{accommodationSubtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>Overnight Fee:</span>
                              <span className={isOvernight ? "font-bold text-[#B38728] dark:text-[#FACC15]" : "text-slate-600 dark:text-slate-400"}>
                                ₱{cottageOvernightFee.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Stay</div>
                        )}
                      </TableCell>

                      <TableCell className="py-4">
                        {isResort ? (
                          <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 font-semibold px-2.5 py-1">
                            <Banknote className="w-3.5 h-3.5 mr-1.5 text-amber-600 dark:text-amber-400" /> Pay at Resort
                          </Badge>
                        ) : isGcash ? (
                          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700/60 font-semibold px-2.5 py-1">
                            <CreditCard className="w-3.5 h-3.5 mr-1.5 text-blue-600 dark:text-blue-400" /> GCash Transfer
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500 dark:text-slate-400 dark:border-slate-700">Standard Payment</Badge>
                        )}
                      </TableCell>

                      <TableCell className="py-4 space-y-2">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Payment Status</span>
                          <Badge 
                            className={cn(
                              "px-2.5 py-0.5 rounded-full font-semibold text-[11px]",
                              p?.status === "verified" ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700" :
                              p?.status === "rejected" ? "bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-700" :
                              "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse"
                            )}
                          >
                            {p?.status === "pending" ? "Awaiting Verification" : p?.status === "rejected" ? "Declined" : (p?.status || "Unpaid")}
                          </Badge>
                        </div>
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Booking Status</span>
                          {b.status === "completed" ? (
                            <Badge className="px-2.5 py-0.5 rounded-full font-bold text-[11px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 shadow-xs flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Completed
                            </Badge>
                          ) : b.status === "approved" ? (
                            <Badge className="px-2.5 py-0.5 rounded-full font-bold text-[11px] bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700/60 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Confirmed
                            </Badge>
                          ) : b.status === "pending" ? (
                            <Badge className="px-2.5 py-0.5 rounded-full font-semibold text-[11px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Reserved
                            </Badge>
                          ) : b.status === "no-show" ? (
                            <Badge className="px-2.5 py-0.5 rounded-full font-semibold text-[11px] bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700/60 flex items-center gap-1">
                              <UserX className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> No-Show
                            </Badge>
                          ) : (
                            <Badge className="px-2.5 py-0.5 rounded-full font-semibold text-[11px] bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700/60 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> Cancelled
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-4 text-right pr-6">
                        <div className="flex flex-col items-end gap-1.5 min-w-[130px]">
                          {p?.receipt_url && (
                            <Button size="sm" variant="outline" onClick={() => viewReceipt(p.receipt_url)} className="w-full h-8 text-xs font-semibold border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                              <Eye className="w-3.5 h-3.5 mr-1.5 text-slate-600 dark:text-slate-300" /> View Receipt
                            </Button>
                          )}
                          
                          {b.status === "pending" && (
                            <div className="flex items-center gap-1.5 w-full">
                              <Button
                                size="sm"
                                onClick={() => updateBookingStatus(b.id, "approved")}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-semibold shadow-sm flex-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => updateBookingStatus(b.id, "rejected")}
                                className="h-8 text-xs font-semibold flex-1"
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                              </Button>
                            </div>
                          )}

                          {b.status === "completed" && (
                            <div className="w-full space-y-1">
                              <div className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold shadow-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Completed Stay
                              </div>

                              {(!p || p.status !== "verified") && (
                                <Button
                                  size="sm"
                                  onClick={() => updatePaymentStatus(b.id, b.user_id, p?.id, "verified", b.total_amount)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs font-semibold shadow-sm w-full"
                                >
                                  <Banknote className="w-3.5 h-3.5 mr-1" /> Mark Paid
                                </Button>
                              )}

                              {(p && p.status === "verified") && (
                                <div className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 text-[11px] font-medium select-none" title="Payment settled for completed booking">
                                  <Lock className="w-3 h-3 text-slate-400" /> Settled / Locked
                                </div>
                              )}
                            </div>
                          )}

                          {(b.status === "approved" || b.status === "no-show") && (
                            <>
                              {(!p || p.status !== "verified") && (
                                <Button
                                  size="sm"
                                  onClick={() => updatePaymentStatus(b.id, b.user_id, p?.id, "verified", b.total_amount)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs font-semibold shadow-sm w-full"
                                >
                                  <Banknote className="w-3.5 h-3.5 mr-1.5" /> Mark Paid
                                </Button>
                              )}

                              {(p && p.status === "verified") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => undoPaymentStatus(b.id, p.id, p.status)}
                                  className="h-8 text-xs border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-semibold w-full"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Undo Payment
                                </Button>
                              )}

                              {b.status === "approved" && (
                                <div className="flex gap-1.5 w-full mt-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateBookingStatus(b.id, "completed")}
                                    className="h-7 text-[11px] border-emerald-500 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-medium flex-1"
                                  >
                                    Complete
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => markNoShow(b.id, p?.id, isResort)}
                                    className="h-7 text-[11px] border-amber-500 dark:border-amber-600 text-amber-700 dark:text-amber-300 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-medium flex-1"
                                  >
                                    No-Show
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                          
                          <Button size="icon" variant="ghost" onClick={() => deleteBooking(b.id)} className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 self-end mt-1">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Cancellation Audit Breakdown Modal Dialog */}
      <Dialog open={!!selectedCancelledBooking} onOpenChange={(open) => !open && setSelectedCancelledBooking(null)}>
        <DialogContent className="max-w-3xl w-[95vw] bg-white dark:bg-[#151F2E] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl p-0 shadow-2xl flex flex-col max-h-[90vh]">
          {selectedCancelledBooking && (() => {
            const b = selectedCancelledBooking;
            const p = b.payments?.[0];
            let notes: any = {};
            try {
              if (p?.notes) notes = JSON.parse(p.notes);
            } catch (e) {}

            const customerName = b.guest_name || b.profile?.fullname || notes.cancelled_by_name || "Guest Customer";
            const customerEmail = b.guest_email || b.profile?.email || "No email provided";
            const customerPhone = b.guest_phone || b.profile?.phone || "No phone provided";
            const cancelDate = b.cancelled_at || notes.cancellation_date || b.updated_at || b.created_at;
            const cancellationReason = getCancellationReason(b, notes);
            const cancellationActor = getCancellationActor(b, notes);

            return (
              <>
                <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-4 px-6 pt-6 shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-[10px] uppercase tracking-wider border border-rose-200 dark:border-rose-800/60">
                        Cancelled Reservation Audit
                      </span>
                      <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white font-display mt-1">
                        Cancellation Breakdown
                      </DialogTitle>
                    </div>
                    <Badge variant="destructive" className="capitalize text-xs font-bold px-3 py-1">
                      {b.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-2 flex-wrap">
                    <span className="break-all">Reference ID: {b.id}</span>
                    <button
                      onClick={() => handleCopyId(b.id)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 shrink-0"
                      title="Copy ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </DialogHeader>

                <div className="space-y-5 py-4 px-6 text-sm overflow-y-auto flex-1">
                  {/* Customer Information Card */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      <User className="w-4 h-4 text-[#D4AF37] dark:text-[#FACC15]" />
                      Customer Information
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block">Full Name</span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{customerName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Email Address</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{customerEmail}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Contact Number</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{customerPhone}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">User Account ID</span>
                        <span className="font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                          {b.user_id ? b.user_id : "Guest (Non-registered)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cancellation Reason Details Card */}
                  <div className="bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-800/60 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      CANCELLATION STATED REASON & DATE
                    </div>
                    <div className="space-y-3">
                      <div className="bg-white dark:bg-slate-800/70 p-3.5 rounded-lg border border-rose-200 dark:border-rose-800/60 text-xs">
                        <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1.5">
                          GUEST REASON
                        </span>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm break-words whitespace-pre-wrap leading-relaxed">
                          {cancellationReason}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                        <div className="bg-white dark:bg-slate-800/70 p-3 rounded-lg border border-rose-200 dark:border-rose-800/60">
                          <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">
                            Cancelled Timestamp
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                            {formatCancellationTimestamp(cancelDate)}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-800/70 p-3 rounded-lg border border-rose-200 dark:border-rose-800/60">
                          <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">
                            Cancellation Action By
                          </span>
                          <span className={cn(
                            "font-bold text-xs sm:text-sm",
                            cancellationActor === "Customer" ? "text-amber-700 dark:text-amber-400" :
                            cancellationActor === "Admin" ? "text-rose-700 dark:text-rose-400" :
                            cancellationActor === "System" ? "text-sky-700 dark:text-sky-400" :
                            "text-slate-800 dark:text-slate-200"
                          )}>
                            {cancellationActor}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Room & Stay Details Card */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      <BedDouble className="w-4 h-4 text-[#D4AF37] dark:text-[#FACC15]" />
                      Stay & Room Details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block">Room / Accommodation</span>
                        <span className="font-bold text-slate-900 dark:text-white">{b.room?.name || "Room"}</span>
                        {b.room?.type && (
                          <span className="text-slate-500 dark:text-slate-400 block text-[11px] uppercase">
                            Type: {b.room.type === "villa" ? "Function Hall" : b.room.type}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400 block">Check-in / Check-out</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {b.check_in} → {b.check_out}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Guests</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {b.guests} Guest{b.guests > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    {b.special_requests && (
                      <div className="text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-slate-400 block">Special Requests</span>
                        <span className="text-slate-700 dark:text-slate-300 italic">"{b.special_requests}"</span>
                      </div>
                    )}
                  </div>

                  {/* Payment Details Card */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      <Banknote className="w-4 h-4 text-[#D4AF37] dark:text-[#FACC15]" />
                      Payment Information
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block">Total Amount</span>
                        <span className="font-bold text-base text-[#B38728] dark:text-[#FACC15]">
                          ₱{Number(b.total_amount || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Payment Method</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">
                          {notes.method === "gcash" ? "GCash Transfer" : "Pay at Resort"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Payment Status</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                          {p?.status || "Unpaid"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="border-t border-slate-100 dark:border-slate-800 pt-4 px-6 pb-5 shrink-0">
                  <Button
                    variant="outline"
                    className="rounded-xl text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() => setSelectedCancelledBooking(null)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
