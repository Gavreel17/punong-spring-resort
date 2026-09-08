import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { 
  Upload, Eye, AlertCircle, RefreshCw, Star, Download, Sparkles, Plus, 
  Calendar, Users, CreditCard, Banknote, CheckCircle2, XCircle, Clock, 
  MessageSquareQuote, ShieldCheck, Check, Loader2
} from "lucide-react";
import { processAutoBookingStatuses } from "@/lib/booking-utils";
import { cn } from "@/lib/utils";
import { CustomerInquiriesSection } from "@/components/CustomerInquiriesSection";
import { 
  generateAndDownloadReceiptPdf, 
  formatBookingReference 
} from "@/lib/receipt-generator";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "My Guest Portal — Punong Spring Resort" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelData, setCancelData] = useState<{ id: string, payment: any } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [feedbackData, setFeedbackData] = useState<{ id: string } | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "completed" | "cancelled">("all");
  const [activeTab, setActiveTab] = useState<"bookings" | "messages">("bookings");

  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  const handleDownloadPdf = async (booking: any) => {
    setDownloadingReceiptId(booking.id);
    try {
      await generateAndDownloadReceiptPdf(booking.id, booking);
    } catch (err) {
      console.error("Failed to download PDF receipt:", err);
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  // Real-time unread messages count for customer
  const { data: customerUnreadCount = 0 } = useQuery({
    queryKey: ["customer-unread-inquiries", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: inqs, error: inqErr } = await supabase
        .from("inquiries")
        .select("id")
        .or(`customer_id.eq.${user.id},email.eq.${user.email}`);

      if (inqErr || !inqs || inqs.length === 0) return 0;

      const inqIds = inqs.map((i: { id: string }) => i.id);

      const { count, error: countErr } = await supabase
        .from("inquiry_messages")
        .select("*", { count: "exact", head: true })
        .in("inquiry_id", inqIds)
        .eq("sender_role", "admin")
        .is("read_at", null);

      if (countErr) return 0;
      return count || 0;
    },
    refetchInterval: 10000,
  });

  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackData || !user) return;
    setSubmittingFeedback(true);
    
    const targetBooking = bookings.find((b: any) => b.id === feedbackData.id);
    const guestName = targetBooking?.guest_name || user.email?.split("@")[0] || "Guest";

    const { error } = await supabase.from("feedbacks").insert({
      booking_id: feedbackData.id,
      user_id: user.id,
      guest_name: guestName,
      rating: feedbackRating,
      comment: feedbackComment,
    });

    setSubmittingFeedback(false);
    if (error) return toast.error(error.message);

    toast.success("Feedback submitted successfully. Thank you!");
    setFeedbackData(null);
    setFeedbackRating(5);
    setFeedbackComment("");
    queryClient.invalidateQueries({ queryKey: ["approved-feedbacks"] });
    refetch();
  }

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate({ to: "/auth" });
      } else if (role === "admin") {
        toast.info("Welcome back Admin! Redirecting to Admin Executive Suite.");
        navigate({ to: "/admin/calendar", replace: true });
      }
    }
  }, [user, role, loading, navigate]);

  const { data: bookings = [], refetch } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, room:rooms(name,type,image_url), payments(id,amount,status,receipt_url,notes), feedbacks(id,rating,comment)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      if (data) {
        await processAutoBookingStatuses(data);
      }

      return data;
    },
  });

  const filteredBookings = useMemo(() => {
    if (statusFilter === "all") return bookings;
    if (statusFilter === "approved") return bookings.filter((b: any) => b.status === "approved" || b.status === "pending");
    if (statusFilter === "completed") return bookings.filter((b: any) => b.status === "completed");
    if (statusFilter === "cancelled") return bookings.filter((b: any) => b.status === "cancelled" || b.status === "rejected" || b.status === "no-show");
    return bookings;
  }, [bookings, statusFilter]);

  // Compute summary stats
  const activeCount = bookings.filter((b: any) => b.status === "approved" || b.status === "pending").length;
  const completedCount = bookings.filter((b: any) => b.status === "completed").length;
  const totalSpent = bookings
    .filter((b: any) => b.status === "approved" || b.status === "completed")
    .reduce((sum: number, b: any) => sum + Number(b.total_amount || 0), 0);

  const guestName = user?.email?.split("@")[0] || "Valued Guest";

  async function handleCancel() {
    if (!cancelData || !cancelReason) return;
    
    const { error: bErr } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", cancelData.id);
    if (bErr) return toast.error(bErr.message);

    const payment = cancelData.payment;
    if (payment) {
        let parsedNotes: any = {};
        try { parsedNotes = JSON.parse(payment.notes); } catch(e){}

        parsedNotes.cancellation_reason = cancelReason;
        parsedNotes.cancellation_date = new Date().toISOString();

        let newPaymentStatus = payment.status;
        if (parsedNotes.method === "resort") {
            newPaymentStatus = "unpaid";
        } else if (parsedNotes.method === "gcash") {
            newPaymentStatus = "refund_pending";
        }

        await supabase.from("payments").update({
            status: newPaymentStatus,
            notes: JSON.stringify(parsedNotes)
        }).eq("id", payment.id);
    }

    toast.success("Booking cancelled successfully.");
    setCancelData(null);
    setCancelReason("");
    refetch();
  }

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans">
      <Navbar />
      
      <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-5xl space-y-8">
        {/* Luxury Hero Banner */}
        <div className="relative rounded-3xl bg-gradient-to-r from-[#071216] via-[#0C1C24] to-[#0A161E] text-white p-6 sm:p-10 border border-[#D4AF37]/30 shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-bold uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5" /> Punong Reserve & Spa
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight text-white capitalize">
                Welcome Back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E5C158] via-[#D4AF37] to-[#B38728]">{guestName}</span>
              </h1>
              <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
                Manage your stays, view reservation receipts, update payment proofs, and leave reviews for your Punong Spring Resort getaway.
              </p>

              {/* Guest Summary Badges */}
              <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
                  <Calendar className="w-4 h-4 text-[#D4AF37]" />
                  <span><strong>{activeCount}</strong> Active Stay{activeCount === 1 ? '' : 's'}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span><strong>{completedCount}</strong> Completed Visit{completedCount === 1 ? '' : 's'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("messages")}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border border-white/10 cursor-pointer text-white"
                >
                  <MessageSquareQuote className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    <strong>Messages & Inquiries</strong>
                    {customerUnreadCount > 0 && (
                      <span className="ml-1.5 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold animate-pulse">
                        {customerUnreadCount} New
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </div>

            <Button asChild className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 hover:brightness-105 font-bold shadow-lg h-12 px-6 rounded-2xl shrink-0 cursor-pointer">
              <Link to="/rooms">
                <Plus className="w-4 h-4 mr-2 stroke-[3]" /> Book New Experience
              </Link>
            </Button>
          </div>
        </div>

        {/* Primary Dashboard Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200/80 pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("bookings")}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
              activeTab === "bookings"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            )}
          >
            <Calendar className="w-4 h-4 text-[#D4AF37]" />
            My Reservations
            <span className="ml-1 text-[11px] opacity-80">({bookings.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("messages")}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer relative",
              activeTab === "messages"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            )}
          >
            <MessageSquareQuote className="w-4 h-4 text-[#D4AF37]" />
            Messages & Inquiries
            {customerUnreadCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-sm">
                {customerUnreadCount}
              </span>
            )}
          </button>
        </div>

        {activeTab === "bookings" ? (
          <>
            {/* Status Filter Tabs & Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-display">My Reservations Ledger</h2>
                <p className="text-xs text-slate-500">Filtered view of your historical and upcoming bookings.</p>
              </div>

          <div className="flex items-center gap-1.5 bg-slate-200/60 p-1.5 rounded-2xl border border-slate-200">
            <button
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                statusFilter === "all" ? "bg-white text-slate-900 shadow-sm font-bold" : "text-slate-600 hover:text-slate-900"
              )}
            >
              All ({bookings.length})
            </button>
            <button
              onClick={() => setStatusFilter("approved")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                statusFilter === "approved" ? "bg-white text-emerald-700 shadow-sm font-bold" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter("completed")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                statusFilter === "completed" ? "bg-white text-blue-700 shadow-sm font-bold" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Completed ({completedCount})
            </button>
            <button
              onClick={() => setStatusFilter("cancelled")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                statusFilter === "cancelled" ? "bg-white text-rose-700 shadow-sm font-bold" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Cancelled
            </button>
          </div>
        </div>

        {/* Bookings Card List */}
        {filteredBookings.length === 0 ? (
          <div className="p-12 text-center border border-slate-200 rounded-3xl bg-white shadow-sm space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-[#D4AF37] flex items-center justify-center mx-auto border border-[#D4AF37]/30">
              <Calendar className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 font-display">No Reservations Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">You don't have any bookings matching this status filter yet.</p>
            </div>
            <Button asChild className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 px-6 rounded-xl">
              <Link to="/rooms">Browse Accommodations</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredBookings.map((b: any) => {
              const p = b.payments?.[0];
              let notes: any = {};
              try { if (p?.notes) notes = JSON.parse(p.notes); } catch(e){}

              const isResort = notes.method === "resort";
              const isGcash = notes.method === "gcash";

              return (
                <div 
                  key={b.id} 
                  className="rounded-2xl border border-slate-200/90 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_35px_rgba(212,175,55,0.08)] transition-all duration-300 overflow-hidden bg-white group flex flex-col md:flex-row"
                >
                  {/* Left Room Thumbnail Cover */}
                  <div className="relative md:w-72 h-48 md:h-auto bg-slate-900 shrink-0 overflow-hidden">
                    <img
                      src={b.room?.image_url || "/room-1.jpg"}
                      alt={b.room?.name || "Resort Room"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                      onError={(e: any) => {
                        e.target.src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-slate-950/20"></div>

                    {/* Room Type Tag */}
                    <span className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md text-amber-300 border border-[#D4AF37]/30 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {b.room?.type === 'villa' ? 'Function Hall' : (b.room?.type || 'ROOM')}
                    </span>
                  </div>

                  {/* Right Content Section */}
                  <div className="flex-1 p-6 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="text-xl font-bold font-display text-slate-900">{b.room?.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                              <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                              {b.check_in} → {b.check_out}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-full">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              {b.guests} guest{b.guests === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>

                        {/* Booking Status Badge */}
                        <div>
                          <Badge className={cn(
                            "px-3 py-1 rounded-full font-bold text-xs capitalize shadow-sm",
                            b.status === "approved" ? "bg-emerald-100 text-emerald-800 border border-emerald-300" :
                            b.status === "completed" ? "bg-blue-100 text-blue-800 border border-blue-300" :
                            b.status === "pending" ? "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse" :
                            "bg-rose-100 text-rose-800 border border-rose-200"
                          )}>
                            Booking: {b.status === "approved" ? "Confirmed" : b.status === "pending" ? "Reserved" : b.status === "rejected" ? "Cancelled" : b.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Guest Details Container */}
                      <div className="mt-4 p-3.5 rounded-xl bg-slate-50/90 border-l-4 border-[#D4AF37] border-y border-r border-slate-200/80 text-xs text-slate-600 space-y-1">
                        <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">Guest & Reservation Details</div>
                        <div className="flex flex-wrap items-center gap-4 text-slate-700 font-medium">
                          <span>Name: <strong className="text-slate-900">{b.guest_name}</strong></span>
                          <span>Ref ID: <strong className="font-mono bg-slate-200/80 px-1.5 py-0.5 rounded text-[10px] text-slate-800">{formatBookingReference(b)}</strong></span>
                          <span>Contact: <strong>{b.guest_email}</strong> • <strong>{b.guest_phone}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Row: Total Amount & Payment & Actions */}
                    <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 block">Total Stay Price</span>
                        <span className="text-2xl font-extrabold text-[#B38728] font-display">
                          ₱{Number(b.total_amount).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex flex-col sm:items-end gap-3">
                        <PaymentSection booking={b} onChange={refetch} />

                        {/* Actions Row */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-9 px-4 rounded-xl text-xs shadow-sm cursor-pointer disabled:opacity-75"
                            disabled={downloadingReceiptId === b.id}
                            onClick={() => handleDownloadPdf(b)}
                          >
                            {downloadingReceiptId === b.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-[#D4AF37]" /> Generating PDF...
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5 mr-1 text-[#D4AF37]" /> Download Receipt
                              </>
                            )}
                          </Button>

                          {(!b.feedbacks || b.feedbacks.length === 0) && b.status === "completed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-[#D4AF37] text-[#B38728] hover:bg-[#D4AF37]/10 font-bold h-9 px-4 rounded-xl text-xs cursor-pointer"
                              onClick={() => setFeedbackData({ id: b.id })}
                            >
                              <Star className="w-3.5 h-3.5 mr-1 fill-amber-400 text-amber-400" /> Leave Review
                            </Button>
                          )}

                          {(b.status !== "cancelled" && b.status !== "rejected" && b.status !== "completed") && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold h-9 px-3.5 rounded-xl text-xs cursor-pointer"
                              onClick={() => setCancelData({ id: b.id, payment: b.payments?.[0] })}
                            >
                              Cancel Booking
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        ) : (
          <CustomerInquiriesSection user={user} />
        )}
      </main>

      {/* Cancellation Reason Modal */}
      <Dialog open={!!cancelData} onOpenChange={(o) => !o && setCancelData(null)}>
        <DialogContent className="rounded-2xl max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-display text-rose-700">Cancel Reservation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-slate-600">Select Cancellation Reason</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger className="rounded-xl border-slate-200 h-10">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Change of Plans">Change of Plans</SelectItem>
                  <SelectItem value="Emergency">Emergency</SelectItem>
                  <SelectItem value="Wrong Booking Details">Wrong Booking Details</SelectItem>
                  <SelectItem value="Financial Reasons">Financial Reasons</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-xs text-rose-800 leading-relaxed font-medium">
              Are you sure you want to cancel this booking? Cancellations are subject to resort terms. 
              {cancelData?.payment?.notes?.includes("gcash") && " For GCash payments, refund requests are reviewed by resort admin."}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="rounded-xl h-10 text-xs font-semibold" onClick={() => setCancelData(null)}>Keep Booking</Button>
            <Button variant="destructive" className="rounded-xl h-10 text-xs font-bold" onClick={handleCancel} disabled={!cancelReason}>Confirm Cancellation</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Interactive Star Feedback Modal */}
      <Dialog open={!!feedbackData} onOpenChange={(o) => !o && setFeedbackData(null)}>
        <DialogContent className="rounded-2xl max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-display flex items-center gap-2">
              <Star className="w-5 h-5 text-[#D4AF37] fill-[#D4AF37]" />
              Share Your Resort Experience
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFeedbackSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-slate-600">Star Rating</Label>
              <div className="flex items-center gap-2 pt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedbackRating(star)}
                    className="p-1 focus:outline-none transition-transform hover:scale-110 cursor-pointer"
                  >
                    <Star
                      className={cn(
                        "w-7 h-7 transition-colors",
                        star <= feedbackRating
                          ? "fill-[#D4AF37] text-[#D4AF37]"
                          : "text-slate-300 hover:text-amber-300"
                      )}
                    />
                  </button>
                ))}
                <span className="ml-2 text-xs font-bold text-[#B38728]">
                  {feedbackRating === 5 ? "5/5 (Excellent)" :
                   feedbackRating === 4 ? "4/5 (Great)" :
                   feedbackRating === 3 ? "3/5 (Average)" :
                   feedbackRating === 2 ? "2/5 (Poor)" : "1/5 (Terrible)"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-slate-600">Your Comments & Review</Label>
              <textarea
                required
                rows={4}
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder="Tell us what you loved about your stay..."
                className="w-full p-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" className="rounded-xl h-10 text-xs font-semibold" onClick={() => setFeedbackData(null)}>Cancel</Button>
              <Button 
                type="submit" 
                disabled={submittingFeedback}
                className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 font-bold h-10 px-5 rounded-xl shadow-md cursor-pointer"
              >
                {submittingFeedback ? "Submitting..." : "Submit Review"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

function PaymentSection({ booking, onChange }: { booking: any; onChange: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const payment = booking.payments?.[0];
  let parsedNotes: any = {};
  if (payment?.notes) {
    try {
      parsedNotes = JSON.parse(payment.notes);
    } catch (e) {}
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !user) return;
    setUploading(true);
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const { error: upErr } = await supabase.storage.from("receipts").upload(fileName, file, { upsert: false });
    
    if (upErr) {
      setUploading(false);
      return toast.error("Failed to upload: " + upErr.message);
    }
    
    const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(fileName);

    const notesPayload = JSON.stringify({
      method: "gcash",
      reference_number: paymentRef,
      remarks: "Re-uploaded receipt",
    });

    if (payment?.id) {
      const { error } = await supabase.from("payments").update({
        amount: Number(amount),
        receipt_url: urlData.publicUrl,
        status: "pending",
        notes: notesPayload
      }).eq("id", payment.id);
      
      setUploading(false);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("payments").insert({
        booking_id: booking.id,
        user_id: user.id,
        amount: Number(amount),
        receipt_url: urlData.publicUrl,
        status: "pending",
        notes: notesPayload
      });
      setUploading(false);
      if (error) return toast.error(error.message);
    }

    toast.success("Payment receipt uploaded. Awaiting verification.");
    setOpen(false);
    onChange();
  }

  if (!payment) {
    if (booking.status === "rejected" || booking.status === "cancelled") return null;
    return (
      <Badge variant="outline" className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[10px]">
        Standard Payment
      </Badge>
    );
  }

  const isResort = parsedNotes.method === "resort";
  const isGcash = parsedNotes.method === "gcash";

  return (
    <div className="flex flex-col items-start sm:items-end gap-1.5 text-right">
      <div className="flex flex-wrap items-center gap-2">
        {isResort && (
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 font-semibold px-2.5 py-0.5 rounded-full text-xs">
            <Banknote className="w-3.5 h-3.5 mr-1 text-amber-600" /> Pay at Resort
          </Badge>
        )}
        {isGcash && (
          <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-semibold px-2.5 py-0.5 rounded-full text-xs">
            <CreditCard className="w-3.5 h-3.5 mr-1 text-blue-600" /> GCash Transfer
          </Badge>
        )}
        
        {isResort && payment.status !== "verified" && (
          <Badge className="bg-amber-100 text-amber-800 border border-amber-300 font-semibold px-2.5 py-0.5 rounded-full text-xs">Unpaid</Badge>
        )}
        {isResort && payment.status === "verified" && (
          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold px-2.5 py-0.5 rounded-full text-xs">Paid</Badge>
        )}
        
        {isGcash && (
          <Badge className={cn(
            "px-2.5 py-0.5 rounded-full font-semibold text-xs",
            payment.status === "verified" ? "bg-emerald-100 text-emerald-800 border border-emerald-300" :
            payment.status === "rejected" ? "bg-rose-100 text-rose-800 border border-rose-200" :
            "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
          )}>
            Payment: {payment.status === "pending" ? "Awaiting Verification" : payment.status === "rejected" ? "Declined" : payment.status}
          </Badge>
        )}
      </div>

      {isGcash && payment.status === "rejected" && parsedNotes.remarks && (
        <div className="text-xs text-rose-700 flex items-center gap-1 mt-1 bg-rose-50 border border-rose-200 px-3 py-1 rounded-xl">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Reason: {parsedNotes.remarks}
        </div>
      )}

      <div className="flex items-center gap-2 mt-1">
        {payment.receipt_url && (
          <Button size="sm" variant="outline" asChild className="h-8 text-xs font-semibold rounded-xl">
            <a href={payment.receipt_url} target="_blank" rel="noopener noreferrer">
              <Eye className="mr-1.5 h-3.5 w-3.5 text-slate-600" /> View Payment Proof
            </a>
          </Button>
        )}

        {isGcash && payment.status === "rejected" && booking.status !== "no-show" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="default" className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-8 text-xs rounded-xl">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Re-upload
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-w-md p-6">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold font-display">Re-upload GCash Receipt</DialogTitle>
              </DialogHeader>
              <form onSubmit={upload} className="space-y-4 py-2">
                <div>
                  <Label className="text-xs font-semibold uppercase text-slate-600">GCash Reference Number</Label>
                  <Input
                    required
                    placeholder="e.g. 100234958"
                    className="mt-1 rounded-xl border-slate-200"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase text-slate-600">Amount Paid (₱)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 1500"
                    className="mt-1 rounded-xl border-slate-200"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase text-slate-600">Receipt Image (JPG/PNG)</Label>
                  <Input
                    type="file"
                    accept="image/jpeg, image/jpg, image/png"
                    required
                    className="mt-1 rounded-xl border-slate-200 cursor-pointer"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={uploading}
                  className="w-full bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 font-bold h-10 rounded-xl shadow-md cursor-pointer mt-2"
                >
                  {uploading ? "Uploading Proof…" : "Submit Payment Proof"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

