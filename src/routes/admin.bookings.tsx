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
import { Eye, CheckCircle2, XCircle, Banknote, CreditCard, Search, CalendarClock, Trash2, Printer, RotateCcw, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { processAutoBookingStatuses } from "@/lib/booking-utils";
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
      const { data, error } = await supabase
        .from("bookings")
        .select("*, room:rooms(name), profile:profiles!bookings_user_id_fkey(fullname,email), payments(id, amount, status, notes, receipt_url)")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Primary bookings query error, trying fallback query:", error);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("bookings")
          .select("*, room:rooms(name), payments(id, amount, status, notes, receipt_url)")
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

    const { data: updatedBooking, error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", id)
      .select("*, room:rooms(name, type)")
      .single();
    if (error) return MySwal.fire("Error!", error.message, "error");

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
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
    qc.invalidateQueries({ queryKey: ["pending-payments-count"] });
  }

  async function updatePaymentStatus(bookingId: string, userId: string, paymentId: string | undefined, status: string, totalAmount: number) {
    if (paymentId) {
      const { error } = await supabase.from("payments").update({ status }).eq("id", paymentId);
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

    const { data: b } = await supabase.from("bookings").select("status, check_out").eq("id", bookingId).single();
    if (b && b.status === "no-show" && status === "verified") {
      const today = new Date().toISOString().split("T")[0];
      const newStatus = b.check_out <= today ? "completed" : "approved";
      await supabase.from("bookings").update({ status: newStatus }).eq("id", bookingId);
    }

    toast.success(`Payment marked as ${status}`);
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
  }


  async function undoPaymentStatus(bookingId: string, paymentId: string, currentStatus: string) {
    if (!user) return;
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

    let adminName = "Admin";
    try {
      const { data: profile } = await supabase.from("profiles").select("fullname").eq("id", user.id).single();
      if (profile && profile.fullname) adminName = profile.fullname;
    } catch(e){}

    const { error: pErr } = await supabase.from("payments").update({ status: "unpaid" }).eq("id", paymentId);
    if (pErr) return toast.error(pErr.message);

    const { error: aErr } = await supabase.from("payment_audit_logs").insert({
      payment_id: paymentId,
      booking_id: bookingId,
      admin_id: user.id,
      admin_name: adminName,
      previous_status: currentStatus,
      new_status: "unpaid"
    });
    if (aErr) console.warn("Audit log failed (table might not exist):", aErr.message);

    const { error: bErr } = await supabase.from("bookings").update({ status: "approved" }).eq("id", bookingId);
    if (bErr) return toast.error(bErr.message);

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
    const result = await MySwal.fire({
      title: "Move to Recently Deleted?",
      text: "You can restore this later from the Reports dashboard.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (!result.isConfirmed) return;

    const { error } = await supabase.from("bookings").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return MySwal.fire("Error!", error.message, "error");

    MySwal.fire("Deleted!", "Booking has been deleted.", "success");
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
    qc.invalidateQueries({ queryKey: ["reports-bookings-all"] });
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
              Reservation Control
            </span>
            <span className="text-xs text-slate-400 font-medium">({filteredBookings.length} Active Booking{filteredBookings.length === 1 ? '' : 's'})</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Bookings & Payment Ledger
          </h2>
          <p className="text-sm text-slate-500">Verify GCash receipts, update stay statuses, and manage guest reservations.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search Name, ID, or Ref No..."
              className="pl-9 h-10 border-slate-200 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] bg-slate-50/50 rounded-xl transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-52 h-10 rounded-xl border-slate-200 bg-slate-50/50">
              <SelectValue placeholder="Status Filter" />
            </SelectTrigger>
            <SelectContent>
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
      <div className="overflow-hidden rounded-xl border border-slate-200/80 shadow-sm bg-white">
        <Table>
          <TableHeader className="bg-slate-50/80">
            <TableRow className="border-b border-slate-200/80">
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Guest & Booking ID</TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Room & Dates</TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Total Amount</TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Payment Method</TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Statuses</TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4 text-right pr-6">Quick Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
                    <p className="text-xs uppercase tracking-widest font-semibold text-slate-500">
                      Loading reservations ledger...
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredBookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <CalendarClock className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium">No bookings found matching your search or status filter.</p>
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

              return (
                <TableRow key={b.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-900 to-slate-800 text-[#D4AF37] flex items-center justify-center font-bold text-sm shrink-0 ring-2 ring-[#D4AF37]/30 shadow-md">
                        {initial}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{b.guest_name}</div>
                        <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
                          ID: <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600 font-semibold">{b.id.split("-")[0]}</span>
                        </div>
                        <div className="text-xs text-slate-500">{b.guest_email}</div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                      {b.room?.name || "Room"}
                      {b.room?.type && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {b.room.type}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="font-medium text-slate-700">{b.check_in}</span> 
                      <span className="text-slate-300">→</span> 
                      <span className="font-medium text-slate-700">{b.check_out}</span>
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <div className="font-display font-extrabold text-[#B38728] text-base">
                      ₱{Number(b.total_amount).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Stay</div>
                  </TableCell>

                  <TableCell className="py-4">
                    {isResort ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 font-semibold px-2.5 py-1">
                        <Banknote className="w-3.5 h-3.5 mr-1.5 text-amber-600" /> Pay at Resort
                      </Badge>
                    ) : isGcash ? (
                      <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-semibold px-2.5 py-1">
                        <CreditCard className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> GCash Transfer
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-500">Standard Payment</Badge>
                    )}
                  </TableCell>

                  <TableCell className="py-4 space-y-2">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Payment Status</span>
                      <Badge 
                        className={cn(
                          "px-2.5 py-0.5 rounded-full font-semibold text-[11px]",
                          p?.status === "verified" ? "bg-emerald-100 text-emerald-800 border border-emerald-300" :
                          p?.status === "rejected" ? "bg-rose-100 text-rose-800 border border-rose-200" :
                          "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                        )}
                      >
                        {p?.status === "pending" ? "Awaiting Verification" : p?.status === "rejected" ? "Declined" : (p?.status || "Unpaid")}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Booking Status</span>
                      <Badge variant={b.status === "approved" || b.status === "completed" ? "default" : "secondary"} className="capitalize px-2.5 py-0.5 font-semibold text-[11px]">
                        {b.status === "approved" ? "Confirmed" : b.status === "pending" ? "Reserved" : b.status === "rejected" ? "Cancelled" : b.status}
                      </Badge>
                    </div>
                  </TableCell>

                  <TableCell className="py-4 text-right pr-6">
                    <div className="flex flex-col items-end gap-1.5 min-w-[130px]">
                      {p?.receipt_url && (
                        <Button size="sm" variant="outline" onClick={() => viewReceipt(p.receipt_url)} className="w-full h-8 text-xs font-semibold border-slate-200 hover:bg-slate-100">
                          <Eye className="w-3.5 h-3.5 mr-1.5 text-slate-600" /> View Receipt
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

                      {(b.status === "approved" || b.status === "completed" || b.status === "no-show") && (
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
                              className="h-8 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 font-semibold w-full"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Undo Payment
                            </Button>
                          )}

                          {b.status !== "completed" && b.status !== "no-show" && (
                            <div className="flex gap-1.5 w-full mt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateBookingStatus(b.id, "completed")}
                                className="h-7 text-[11px] border-emerald-500 text-emerald-700 hover:bg-emerald-50 font-medium flex-1"
                              >
                                Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markNoShow(b.id, p?.id, isResort)}
                                className="h-7 text-[11px] border-amber-500 text-amber-700 hover:bg-amber-50 font-medium flex-1"
                              >
                                No-Show
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                      
                      <Button size="icon" variant="ghost" onClick={() => deleteBooking(b.id)} className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 self-end mt-1">
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

