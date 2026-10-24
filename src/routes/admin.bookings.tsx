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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { Eye, CheckCircle2, XCircle, Banknote, CreditCard, Search, CalendarClock, Trash2, Printer, RotateCcw, Loader2, Lock, Check, Clock, UserX } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { processAutoBookingStatuses, getPhilippineTime, isOvernightCottage, getBookingStayType } from "@/lib/booking-utils";
import { autoCompleteBookingsServerFn, undoPaymentServerFn } from "@/lib/api/booking.functions";
import { trashService } from "@/lib/recently-deleted";
import { cn } from "@/lib/utils";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsTab,
});

function BookingsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
        .select("*, room:rooms(name, type, price), profile:profiles!bookings_user_id_fkey(fullname,email), payments(id, amount, status, notes, receipt_url)")
        .order("created_at", { ascending: false });

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

        const validBookings = (fallbackData || []).filter((b: any) => !b.deleted_at);
        if (validBookings.length > 0) {
          await processAutoBookingStatuses(validBookings);
        }
        return validBookings;
      }

      const activeList = (data || []).filter((b: any) => !b.deleted_at);
      if (activeList.length > 0) {
        await processAutoBookingStatuses(activeList);
      }

      return activeList;
    },
  });

  const filteredBookings = useMemo(() => {
    return bookings.filter((b: any) => {
      let notes: any = {};
      const p = b.payments?.[0];
      try { if (p?.notes) notes = JSON.parse(p.notes); } catch(e){}

      // 1. Status Filter
      if (statusFilter !== "all") {

        if (statusFilter === "pending-booking" && b.status !== "pending") return false;
        if (statusFilter === "approved" && b.status !== "approved") return false;
        if (statusFilter === "completed" && b.status !== "completed") return false;
        if (statusFilter === "no-show" && b.status !== "no-show") return false;
        if (statusFilter === "cancelled" && b.status !== "cancelled" && b.status !== "rejected") return false;
      }

      // 2. Search Filter (Customer Name, Booking ID, Ref Number)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const guestMatch = b.guest_name?.toLowerCase().includes(term);
        const idMatch = b.id?.toLowerCase().includes(term);
        if (!guestMatch && !idMatch) return false;
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] dark:text-[#FACC15] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
              Reservation Control
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-400 font-medium">({filteredBookings.length} Active Booking{filteredBookings.length === 1 ? '' : 's'})</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display tracking-tight mt-1">
            Bookings & Payment Ledger
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Verify GCash receipts, update stay statuses, and manage guest reservations.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search Name, ID, or Ref No..."
              className="pl-9 h-10 border-slate-200 dark:border-slate-700 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] bg-slate-50/50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 rounded-xl transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
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
      
      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-[#151F2E]">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-800/60">
            <TableRow className="border-b border-slate-200/80 dark:border-slate-800">
              <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Guest & Booking ID</TableHead>
              <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Room & Dates</TableHead>
              <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Total Amount</TableHead>
              <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Payment Method</TableHead>
              <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Statuses</TableHead>
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
                    {/* ONLY for Cottage: show Stay Type badge */}
                    {isCottage && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Stay Type:</span>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                          isOvernightCottage 
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
                    {/* ONLY for Cottage: show breakdown of Subtotal and Overnight Cottage Fee */}
                    {isCottage ? (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5 border-t border-slate-100 dark:border-slate-800 pt-1">
                        <div className="flex justify-between gap-2">
                          <span>Subtotal:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">₱{accommodationSubtotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>Overnight Fee:</span>
                          <span className={isOvernightCottage ? "font-bold text-[#B38728] dark:text-[#FACC15]" : "text-slate-600 dark:text-slate-400"}>
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

                          {/* If completed booking is unpaid, allow admin to record payment without affecting completed booking status */}
                          {(!p || p.status !== "verified") && (
                            <Button
                              size="sm"
                              onClick={() => updatePaymentStatus(b.id, b.user_id, p?.id, "verified", b.total_amount)}
                              className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs font-semibold shadow-sm w-full"
                            >
                              <Banknote className="w-3.5 h-3.5 mr-1" /> Mark Paid
                            </Button>
                          )}

                          {/* Completed bookings: Payment cannot be undone. Active Undo button is permanently removed and locked. */}
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
      </div>
    </div>
  );
}

