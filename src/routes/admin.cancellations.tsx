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
  CreditCard,
  Eye,
  Copy,
  Check,
  Clock,
  AlertCircle,
  FileText,
  BedDouble,
} from "lucide-react";

export const Route = createFileRoute("/admin/cancellations")({
  component: CancellationsTab,
});

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
        const reasonMatch = notes.cancellation_reason?.toLowerCase().includes(term);

        if (
          !guestName.includes(term) &&
          !guestEmail.includes(term) &&
          !guestPhone.includes(term) &&
          !idMatch &&
          !roomMatch &&
          !reasonMatch
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

      if (notes.cancellation_reason) customerWithReason++;
    });

    return {
      total: bookings.length,
      customerWithReason,
    };
  }, [bookings]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] uppercase tracking-wider border border-rose-200">
              Audit & Cancellation Log
            </span>
            <span className="text-xs text-slate-400 font-medium">
              ({filteredBookings.length} Record{filteredBookings.length === 1 ? "" : "s"})
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Cancelled Bookings & Customers
          </h2>
          <p className="text-sm text-slate-500">
            View customer details for cancelled reservations, review stated cancellation reasons, and monitor refund actions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search Customer, Email, Phone, Reason..."
              className="pl-9 h-10 border-slate-200 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] bg-slate-50/50 rounded-xl transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 bg-white border-slate-200/80 shadow-xs rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Cancelled
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
            <div className="text-xs text-slate-400 mt-0.5">Historical cancellations</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <XCircle className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 bg-white border-slate-200/80 shadow-xs rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Customer Self-Cancelled
            </div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{stats.customerWithReason}</div>
            <div className="text-xs text-slate-400 mt-0.5">With customer stated reason</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <User className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 shadow-sm bg-white">
        <Table>
          <TableHeader className="bg-slate-50/80">
            <TableRow className="border-b border-slate-200/80">
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">
                Customer Who Cancelled
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">
                Room & Reservation
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">
                Cancellation Reason & Details
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4 text-right">
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
                    <p className="text-sm font-medium">Loading cancelled bookings log...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredBookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-40 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <XCircle className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium">No cancelled reservations found.</p>
                    <p className="text-xs text-slate-400">
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

                const isCustomerSelfCancel = !!notes.cancellation_reason || notes.cancelled_by === "Customer";
                const cancelDate = notes.cancellation_date || b.updated_at || b.created_at;

                return (
                  <TableRow
                    key={b.id}
                    className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 cursor-pointer"
                    onClick={() => setSelectedBooking(b)}
                  >
                    {/* Customer Column */}
                    <TableCell className="py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300 flex items-center justify-center font-bold text-slate-700 text-sm shrink-0 shadow-inner">
                          {initial}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm hover:text-[#D4AF37] transition-colors">
                              {customerName}
                            </span>
                            {isCustomerSelfCancel ? (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 text-[10px] px-1.5 py-0">
                                Customer Cancelled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-500 text-[10px] px-1.5 py-0">
                                {b.status === "rejected" ? "Admin Rejected" : "Cancelled"}
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-slate-500">
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
                              className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold transition-colors"
                              title="Click to copy full ID"
                            >
                              {b.id.slice(0, 8)}...
                              {copiedId === b.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
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
                        <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                          <BedDouble className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{b.room?.name || "Unassigned Room"}</span>
                          {b.room?.type && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                              {b.room.type}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-700">{b.check_in}</span>
                          <span className="text-slate-300">→</span>
                          <span className="font-medium text-slate-700">{b.check_out}</span>
                          <span className="text-slate-400">({b.guests} guest{b.guests > 1 ? "s" : ""})</span>
                        </div>

                        {p && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 pt-0.5">
                            <span className="uppercase font-semibold text-slate-600">
                              Payment: {notes.method === "gcash" ? "GCash" : "Pay at Resort"}
                            </span>
                            {p.status === "refund_pending" && (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] px-1.5 py-0">
                                Refund Pending
                              </Badge>
                            )}
                            {p.status === "refunded" && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] px-1.5 py-0">
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
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium max-w-md">
                          <Info className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span className="font-semibold text-rose-900">Reason:</span>
                          <span className="truncate">{notes.cancellation_reason || (b.status === "rejected" ? "Booking rejected by admin" : "No reason specified")}</span>
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pl-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Cancelled:</span>
                          <span className="font-medium text-slate-600">
                            {cancelDate ? new Date(cancelDate).toLocaleString() : "Date unavailable"}
                          </span>
                        </div>

                        {notes.cancelled_by_name && (
                          <div className="text-[11px] text-slate-500 pl-1">
                            Initiated by: <span className="font-medium text-slate-700">{notes.cancelled_by_name}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
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
        <DialogContent className="max-w-2xl bg-white rounded-2xl p-6 shadow-2xl">
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
            const cancelDate = notes.cancellation_date || b.updated_at || b.created_at;

            return (
              <>
                <DialogHeader className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] uppercase tracking-wider border border-rose-200">
                        Cancelled Reservation Audit
                      </span>
                      <DialogTitle className="text-xl font-bold text-slate-900 font-display mt-1">
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
                      className="p-1 hover:bg-slate-100 rounded text-slate-500"
                      title="Copy ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </DialogHeader>

                <div className="space-y-5 py-3 text-sm">
                  {/* Customer Information Card */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                      <User className="w-4 h-4 text-[#D4AF37]" />
                      Customer Information
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block">Full Name</span>
                        <span className="font-bold text-slate-900 text-sm">{customerName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Email Address</span>
                        <span className="font-semibold text-slate-800">{customerEmail}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Contact Number</span>
                        <span className="font-semibold text-slate-800">{customerPhone}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">User Account ID</span>
                        <span className="font-mono text-slate-600 text-[11px]">
                          {b.user_id ? b.user_id : "Guest (Non-registered)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cancellation Reason Details Card */}
                  <div className="bg-rose-50/60 border border-rose-200/70 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-800">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      Cancellation Stated Reason & Date
                    </div>
                    <div className="space-y-2">
                      <div className="bg-white p-3 rounded-lg border border-rose-200 text-xs">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">
                          Guest Reason
                        </span>
                        <p className="font-semibold text-slate-900 text-sm">
                          {notes.cancellation_reason || (b.status === "rejected" ? "Booking rejected by resort admin" : "No specific reason was provided")}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                        <div>
                          <span className="text-slate-400 block">Cancelled Timestamp</span>
                          <span className="font-medium text-slate-700">
                            {cancelDate ? new Date(cancelDate).toLocaleString() : "Unknown"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Cancellation Action By</span>
                          <span className="font-medium text-slate-700">
                            {notes.cancelled_by_name || (notes.cancellation_reason ? customerName : "System/Admin")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Room & Stay Details Card */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                      <BedDouble className="w-4 h-4 text-[#D4AF37]" />
                      Stay & Room Details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block">Room</span>
                        <span className="font-bold text-slate-900">{b.room?.name || "Room"}</span>
                        {b.room?.type && <span className="text-slate-500 block text-[11px]">Type: {b.room.type}</span>}
                      </div>
                      <div>
                        <span className="text-slate-400 block">Check-in / Check-out</span>
                        <span className="font-semibold text-slate-800">
                          {b.check_in} → {b.check_out}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Guests</span>
                        <span className="font-semibold text-slate-800">
                          {b.guests} Guest{b.guests > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    {b.special_requests && (
                      <div className="text-xs pt-1 border-t border-slate-200">
                        <span className="text-slate-400 block">Special Requests</span>
                        <span className="text-slate-700 italic">"{b.special_requests}"</span>
                      </div>
                    )}
                  </div>

                  {/* Payment & Refund Details Card */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                      <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                      Payment & Refund Record
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block">Total Amount</span>
                        <span className="font-bold text-slate-900 text-sm">
                          ₱{Number(b.total_amount || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Payment Method</span>
                        <span className="font-semibold text-slate-800 uppercase">
                          {notes.method === "gcash" ? "GCash Online" : "Pay at Resort"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Payment / Refund Status</span>
                        <span className="font-bold text-slate-900 capitalize">
                          {p?.status ? p.status.replace("_", " ") : "Unpaid"}
                        </span>
                      </div>
                    </div>

                    {notes.reference_number && (
                      <div className="text-xs pt-1 border-t border-slate-200">
                        <span className="text-slate-400 block">Payment Reference Number</span>
                        <span className="font-mono text-slate-700 font-semibold">{notes.reference_number}</span>
                      </div>
                    )}

                    {p?.receipt_url && (
                      <div className="text-xs pt-1">
                        <a
                          href={p.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold"
                        >
                          <FileText className="w-3.5 h-3.5" /> View Uploaded Payment Receipt
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="border-t border-slate-100 pt-4">
                  <Button
                    variant="outline"
                    className="rounded-xl text-xs font-bold"
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
