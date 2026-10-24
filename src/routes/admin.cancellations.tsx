import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search,
  Info,
  XCircle,
  User,
  Mail,
  Phone,
  Calendar,
  Eye,
  Copy,
  Check,
  Clock,
  AlertCircle,
  BedDouble,
} from "lucide-react";

export const Route = createFileRoute("/admin/cancellations")({
  component: CancellationsTab,
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

function CancellationsTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-cancellations"],
    queryFn: async () => {
      // 1. Query cancelled or rejected bookings
      const { data, error } = await supabase
        .from("bookings")
        .select("*, room:rooms(name, type, price), payments(id, amount, status, notes, receipt_url)")
        .or("status.eq.cancelled,status.eq.rejected")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading cancellations:", error);
        throw error;
      }

      // 2. Fetch profiles safely to enrich customer details if needed
      const userIds = [...new Set((data || []).map((b: any) => b.user_id).filter(Boolean))];
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, fullname, email, phone")
            .in("id", userIds);
          if (profiles) {
            profilesMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));
          }
        } catch (e) {
          console.warn("Could not load profiles for cancellations:", e);
        }
      }

      return (data || []).map((b: any) => ({
        ...b,
        profile: profilesMap[b.user_id] || null,
      }));
    },
  });

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("Booking ID copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter((b: any) => {
      let notes: any = {};
      const p = b.payments?.[0];
      try {
        if (p?.notes) notes = JSON.parse(p.notes);
      } catch (e) {}

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const guestName = (b.guest_name || b.profile?.fullname || "").toLowerCase();
        const guestEmail = (b.guest_email || b.profile?.email || "").toLowerCase();
        const guestPhone = (b.guest_phone || b.profile?.phone || "").toLowerCase();
        const idMatch = b.id?.toLowerCase().includes(term);
        const roomMatch = b.room?.name?.toLowerCase().includes(term);
        const reasonMatch = (b.cancellation_reason || notes.cancellation_reason || "")
          .toLowerCase()
          .includes(term);
        const actorMatch = (b.cancelled_by || notes.cancelled_by || "")
          .toLowerCase()
          .includes(term);

        if (
          !guestName.includes(term) &&
          !guestEmail.includes(term) &&
          !guestPhone.includes(term) &&
          !idMatch &&
          !roomMatch &&
          !reasonMatch &&
          !actorMatch
        ) {
          return false;
        }
      }

      return true;
    });
  }, [bookings, searchTerm]);

  // Quick stats
  const stats = useMemo(() => {
    let customerWithReason = 0;

    bookings.forEach((b: any) => {
      const p = b.payments?.[0];
      let notes: any = {};
      try {
        if (p?.notes) notes = JSON.parse(p.notes);
      } catch (e) {}

      const reason = (b.cancellation_reason || notes.cancellation_reason || "").trim();
      if (reason) customerWithReason++;
    });

    return {
      total: bookings.length,
      customerWithReason,
    };
  }, [bookings]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-[10px] uppercase tracking-wider border border-rose-200 dark:border-rose-800/60">
              Audit & Cancellation Log
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-400 font-medium">
              ({filteredBookings.length} Record{filteredBookings.length === 1 ? "" : "s"})
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display tracking-tight mt-1">
            Cancelled Bookings & Customers
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            View customer details for cancelled reservations and review stated cancellation reasons.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search Customer, Email, Phone, Reason..."
              className="pl-9 h-10 border-slate-200 dark:border-slate-700 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] bg-slate-50/50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 rounded-xl transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 bg-white dark:bg-[#151F2E] border-slate-200/80 dark:border-slate-800 shadow-xs rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Cancelled
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.total}</div>
            <div className="text-xs text-slate-400 mt-0.5">Historical cancellations</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <XCircle className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 bg-white dark:bg-[#151F2E] border-slate-200/80 dark:border-slate-800 shadow-xs rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Customer Self-Cancelled
            </div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">{stats.customerWithReason}</div>
            <div className="text-xs text-slate-400 mt-0.5">With customer stated reason</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <User className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-[#151F2E]">
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
              <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4 text-right">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-40 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#D4AF37]"></div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading cancelled bookings log...</p>
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
                      {searchTerm ? "Try searching with a different term." : "Any cancellations made by guests will appear here."}
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

                // Determine customer name, email, phone with fallbacks
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
                    onClick={() => setSelectedBooking(b)}
                  >
                    {/* Customer Column */}
                    <TableCell className="py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-sm shrink-0 shadow-inner">
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
                            <span className="text-[11px] text-slate-400">
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
                              {b.room.type}
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
                          Cancellation Action By: <span className="font-semibold text-slate-700 dark:text-slate-200">{cancellationActor}</span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBooking(b);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Booking Details Modal Dialog */}
      <Dialog open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
        <DialogContent className="max-w-2xl bg-white dark:bg-[#151F2E] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl p-6 shadow-2xl">
          {selectedBooking && (() => {
            const b = selectedBooking;
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
                <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
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
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-2">
                    <span>Reference ID: {b.id}</span>
                    <button
                      onClick={() => handleCopyId(b.id)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400"
                      title="Copy ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </DialogHeader>

                <div className="space-y-5 py-3 text-sm">
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
                        <span className="text-slate-400 block">Room</span>
                        <span className="font-bold text-slate-900 dark:text-white">{b.room?.name || "Room"}</span>
                        {b.room?.type && <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Type: {b.room.type}</span>}
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
                </div>

                <DialogFooter className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <Button
                    variant="outline"
                    className="rounded-xl text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() => setSelectedBooking(null)}
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
