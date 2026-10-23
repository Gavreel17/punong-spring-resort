import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { trashService, TrashItem } from "@/lib/recently-deleted";
import { processAutoBookingStatuses } from "@/lib/booking-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  format,
  isWithinInterval,
  startOfDay,
  endOfDay,
  parseISO,
  subDays,
  startOfMonth,
  startOfYear,
} from "date-fns";
import { FileDown, Printer, FileText, BarChart3, Users, BedDouble, History, RefreshCcw, Trash2, CheckCircle2, AlertCircle, ExternalLink, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ExecutiveReportPrintDocument } from "@/components/ExecutiveReportPrintDocument";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/reports")({
  component: ReportsDashboard,
});

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];
const REASON_COLORS = ["#ef4444", "#f59e0b", "#8b5cf6", "#3b82f6", "#06b6d4", "#ec4899", "#10b981", "#64748b"];

function ReportsDashboard() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfDay(new Date()), "yyyy-MM-dd"));

  const { data: adminProfile } = useQuery({
    queryKey: ["admin-profile-name", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("fullname")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const adminName = useMemo(() => {
    if (adminProfile?.fullname) return adminProfile.fullname;
    const metaName = user?.user_metadata?.fullname || user?.user_metadata?.full_name;
    if (metaName) return metaName;
    if (user?.email) {
      return user.email
        .split("@")[0]
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    return "Administrative Management";
  }, [adminProfile, user]);

  const { data: rawBookings, isLoading } = useQuery({
    queryKey: ["reports-bookings-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, room:rooms(name, type, price), payments(amount, status, notes)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        await processAutoBookingStatuses(data);
      }
      return data;
    },
  });

  const { data: rawRooms } = useQuery({
    queryKey: ["reports-rooms-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*");
      if (error) throw error;
      return data;
    },
  });

  const qc = useQueryClient();

  const filteredBookings = useMemo(() => {
    if (!rawBookings || !startDate || !endDate) return [];
    try {
      const start = startOfDay(parseISO(startDate));
      const end = endOfDay(parseISO(endDate));
      return rawBookings.filter((b: any) => {
        if (b.deleted_at) return false;
        const bDate = parseISO(b.created_at);
        return isWithinInterval(bDate, { start, end });
      });
    } catch {
      return rawBookings.filter((b: any) => !b.deleted_at);
    }
  }, [rawBookings, startDate, endDate]);

  const allTimeCancellations = useMemo(() => {
    if (!rawBookings) return [];
    return rawBookings.filter(
      (b: any) => (b.status === "cancelled" || b.status === "rejected") && !b.deleted_at
    );
  }, [rawBookings]);

  const { data: allTrashItems = [], isLoading: isTrashLoading } = useQuery({
    queryKey: ["admin-trash-all"],
    queryFn: async () => {
      return await trashService.getAllDeleted();
    },
  });

  const [isRefreshingDeleted, setIsRefreshingDeleted] = useState(false);

  const handleRefreshDeleted = async () => {
    if (isRefreshingDeleted) return;
    setIsRefreshingDeleted(true);
    try {
      await qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
      await qc.refetchQueries({ queryKey: ["admin-trash-all"] });
      toast.success("Recently Deleted records refreshed.");
    } catch (err) {
      console.error("Refresh error:", err);
      toast.error("Failed to refresh deleted records.");
    } finally {
      setIsRefreshingDeleted(false);
    }
  };

  const restoreTrashItem = async (item: TrashItem) => {
    const typeLabel =
      item.type === "room"
        ? "Accommodation"
        : item.type === "customer"
        ? "Customer Profile"
        : item.type === "inquiry"
        ? "Customer Inquiry"
        : "Booking Reservation";

    const targetModule =
      item.type === "room"
        ? "Rooms & Cottages Portfolio"
        : item.type === "customer"
        ? "Guest Directory & CRM"
        : item.type === "inquiry"
        ? "Customer Inquiries"
        : "Bookings Management";

    const result = await MySwal.fire({
      title: `Restore ${typeLabel}?`,
      text: `Are you sure you want to restore "${item.title}"? It will be safely returned to ${targetModule} with all original details preserved.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, restore record",
    });

    if (!result.isConfirmed) return;

    const toastId = toast.loading(`Restoring ${item.title}...`);
    const res = await trashService.restore(item);

    if (!res.success) {
      toast.error(res.message || "Failed to restore record.", { id: toastId });
      MySwal.fire("Restoration Failed", res.message || "Failed to restore record.", "error");
    } else {
      toast.success(`"${item.title}" restored successfully!`, { id: toastId });
      qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
      qc.invalidateQueries({ queryKey: ["reports-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-customers-unified"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    }
  };

  const permanentlyDeleteTrashItem = async (item: TrashItem) => {
    const typeLabel =
      item.type === "room"
        ? "accommodation"
        : item.type === "customer"
        ? "customer profile"
        : item.type === "inquiry"
        ? "inquiry thread"
        : "booking";

    const result = await MySwal.fire({
      title: "Permanently Delete?",
      html: `Are you sure you want to permanently delete this ${typeLabel} <strong>"${item.title}"</strong>?<br/><br/><span style="color: #e11d48; font-weight: 600;">Warning: This action cannot be undone.</span> The record will be permanently purged from the database.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, permanently delete",
    });

    if (!result.isConfirmed) return;

    const toastId = toast.loading(`Permanently deleting ${item.title}...`);
    const res = await trashService.deletePermanently(item);

    if (!res.success) {
      toast.error(res.message || "Could not permanently delete record.", { id: toastId });
      MySwal.fire({
        title: "Delete Failed",
        text: res.message || "Could not permanently delete record.",
        icon: "error",
        confirmButtonColor: "#64748b",
      });
    } else {
      toast.success(`"${item.title}" permanently removed from database.`, { id: toastId });
      qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
      qc.invalidateQueries({ queryKey: ["reports-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-customers-unified"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    }
  };

  const stats = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    let cancelled = 0;
    let completed = 0;
    let noShow = 0;
    let revenue = 0;

    let verifiedPayments = 0;
    let pendingPayments = 0;
    let rejectedPayments = 0;
    let gcashCount = 0;
    let resortCount = 0;

    let refundPending = 0;
    let refunded = 0;
    let nonRefundable = 0;
    let cancellationReasonsMap = new Map<string, number>();

    filteredBookings.forEach((b: any) => {
      // Booking Status Stats
      if (b.status === "approved") {
        confirmed++;
        revenue += Number(b.total_amount || 0);
      } else if (b.status === "pending") {
        pending++;
      } else if (b.status === "cancelled" || b.status === "rejected") {
        cancelled++;

        let foundReason = "";
        const paymentsList = Array.isArray(b.payments) ? b.payments : (b.payments ? [b.payments] : []);
        for (const payment of paymentsList) {
          if (payment?.notes) {
            try {
              const parsed = typeof payment.notes === "string" ? JSON.parse(payment.notes) : payment.notes;
              if (parsed?.cancellation_reason && typeof parsed.cancellation_reason === "string" && parsed.cancellation_reason.trim()) {
                foundReason = parsed.cancellation_reason.trim();
                break;
              }
              if (parsed?.reason && typeof parsed.reason === "string" && parsed.reason.trim()) {
                foundReason = parsed.reason.trim();
                break;
              }
            } catch (e) {}
          }
        }

        if (!foundReason) {
          if (b.status === "rejected") {
            foundReason = "Booking rejected by admin";
          } else {
            foundReason = "Requested by guest";
          }
        }

        const displayReason = foundReason.charAt(0).toUpperCase() + foundReason.slice(1);
        cancellationReasonsMap.set(displayReason, (cancellationReasonsMap.get(displayReason) || 0) + 1);
      } else if (b.status === "completed") {
        completed++;
        revenue += Number(b.total_amount || 0);
      } else if (b.status === "no-show") {
        noShow++;
      }

      // Payment Stats - Count only active bookings (exclude cancelled/rejected)
      const isActive = b.status !== "cancelled" && b.status !== "rejected";
      const p = b.payments?.[0];
      let method = "unknown";
      if (p?.notes) {
        try {
          const parsed = typeof p.notes === "string" ? JSON.parse(p.notes) : p.notes;
          method = parsed.method;
        } catch (e) {}
      }

      if (isActive) {
        if (method === "gcash") gcashCount++;
        if (method === "resort") resortCount++;

        if (p?.status === "verified") verifiedPayments++;
        else if (p?.status === "pending") pendingPayments++;
        else if (p?.status === "rejected") rejectedPayments++;
        else if (p?.status === "refund_pending") refundPending++;
        else if (p?.status === "refunded") refunded++;
        else if (p?.status === "non-refundable") nonRefundable++;
      } else {
        if (p?.status === "refund_pending") refundPending++;
        else if (p?.status === "refunded") refunded++;
        else if (p?.status === "non-refundable") nonRefundable++;
      }
    });

    return { 
      total: filteredBookings.length, 
      confirmed, pending, cancelled, completed, noShow, revenue,
      verifiedPayments, pendingPayments, rejectedPayments, gcashCount, resortCount,
      refundPending, refunded, nonRefundable,
      cancellationReasonsData: Array.from(cancellationReasonsMap, ([name, value]) => ({ name, value }))
    };
  }, [filteredBookings]);

  // Data for Charts
  const statusPieData = useMemo(() => {
    return [
      { name: "Confirmed", value: stats.confirmed },
      { name: "Reserved", value: stats.pending },
      { name: "Cancelled", value: stats.cancelled },
      { name: "Completed", value: stats.completed },
      { name: "No-Show", value: stats.noShow },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const paymentMethodData = useMemo(() => {
    return [
      { name: "GCash", value: stats.gcashCount },
      { name: "Resort", value: stats.resortCount },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const dailyRevenueData = useMemo(() => {
    const map = new Map<string, number>();
    filteredBookings.forEach((b: any) => {
      if (b.status === "approved" || b.status === "completed") {
        const dateStr = format(parseISO(b.created_at), "MMM dd");
        map.set(dateStr, (map.get(dateStr) || 0) + Number(b.total_amount || 0));
      }
    });
    const arr = Array.from(map, ([date, amount]) => ({ date, amount }));
    // Sort by actual date order
    arr.sort((a, b) => new Date(a.date + " " + new Date().getFullYear()).getTime() - new Date(b.date + " " + new Date().getFullYear()).getTime());
    return arr;
  }, [filteredBookings]);

  // Room Occupancy Data
  const roomOccupancyData = useMemo(() => {
    if (!rawRooms) return [];
    return rawRooms.map((room: any) => {
      const roomBookings = filteredBookings.filter((b: any) => b.room_id === room.id);
      const timesBooked = roomBookings.length;
      let revenue = 0;
      roomBookings.forEach((b: any) => {
        if (b.status === "approved" || b.status === "completed") {
          revenue += Number(b.total_amount || 0);
        }
      });
      return { name: room.name, timesBooked, revenue, type: room.type };
    }).sort((a: any, b: any) => b.timesBooked - a.timesBooked);
  }, [filteredBookings, rawRooms]);

  // Customer Data
  const customerData = useMemo(() => {
    const map = new Map<string, any>();
    filteredBookings.forEach((b: any) => {
      const key = b.guest_email;
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          name: b.guest_name,
          email: b.guest_email,
          phone: b.guest_phone,
          bookingsCount: 0,
          totalSpent: 0,
        });
      }
      const c = map.get(key);
      c.bookingsCount++;
      if (b.status === "approved" || b.status === "completed") {
        c.totalSpent += Number(b.total_amount || 0);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [filteredBookings]);

  const exportCSV = (data: any[], filename: string) => {
    if (data.length === 0) return toast.error("No data to export");
    const keys = Object.keys(data[0]);
    const headerRow = keys.join(",");
    const rows = data.map((row) =>
      keys
        .map((key) => {
          const val = row[key];
          if (val === null || val === undefined) return '""';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csvContent = [headerRow, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    toast.success(`${filename} downloaded successfully`);
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `Punong_Spring_Resort_Executive_Management_Report_${startDate}_to_${endDate}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };


  const exportExecutiveCSV = () => {
    const rows = [
      { Category: "Report Metadata", Metric: "Resort", Value: "Punong Spring Resort" },
      { Category: "Report Metadata", Metric: "Report Title", Value: "Executive Management Performance Report" },
      { Category: "Report Metadata", Metric: "Reporting Period Start", Value: startDate },
      { Category: "Report Metadata", Metric: "Reporting Period End", Value: endDate },
      { Category: "Report Metadata", Metric: "Generated Timestamp", Value: format(new Date(), "yyyy-MM-dd HH:mm:ss") },
      { Category: "Report Metadata", Metric: "Prepared By", Value: adminName },
      { Category: "Executive Summary", Metric: "Total Reservations", Value: stats.total },
      { Category: "Executive Summary", Metric: "Confirmed Stays", Value: stats.confirmed },
      { Category: "Executive Summary", Metric: "Reserved / Pending", Value: stats.pending },
      { Category: "Executive Summary", Metric: "Cancelled Bookings", Value: stats.cancelled },
      { Category: "Executive Summary", Metric: "No-Show Bookings", Value: stats.noShow },
      { Category: "Executive Summary", Metric: "Total Net Revenue (PHP)", Value: stats.revenue },
      { Category: "Payment Breakdown", Metric: "Verified Payments", Value: stats.verifiedPayments },
      { Category: "Payment Breakdown", Metric: "Pending Payments", Value: stats.pendingPayments },
      { Category: "Payment Channel", Metric: "Pay At Resort", Value: stats.resortCount },
      { Category: "Refund Status", Metric: "Refunds Completed", Value: stats.refunded },
      { Category: "Refund Status", Metric: "Refunds Pending", Value: stats.refundPending },
      { Category: "Refund Status", Metric: "Non-Refundable Cancellations", Value: stats.nonRefundable },
    ];
    exportCSV(rows, `Executive_Summary_${startDate}_to_${endDate}.csv`);
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center animate-pulse flex flex-col items-center justify-center space-y-3">
        <BarChart3 className="h-10 w-10 text-[#D4AF37] animate-bounce" />
        <p className="font-display text-base font-bold text-slate-700">Compiling Executive Resort Analytics...</p>
      </div>
    );
  }

  return (
    <>
      {/* SCREEN DASHBOARD: Hidden entirely during printing */}
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 print:hidden">
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
                Executive Analytics
              </span>
              <span className="text-xs text-slate-400 font-medium">Financial & Occupancy Intelligence</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display tracking-tight mt-1 flex items-center gap-2">
              Reports & Performance Intelligence
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Analyze revenue streams, room occupancy rates, guest payment trends, and historical logs.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 bg-slate-50/80 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 h-9 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
              <span className="text-xs text-slate-400 dark:text-slate-400 font-semibold">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 h-9 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => {
                  setStartDate(format(startOfMonth(new Date()), "yyyy-MM-dd"));
                  setEndDate(format(endOfDay(new Date()), "yyyy-MM-dd"));
                }}
              >
                This Month
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => {
                  setStartDate(format(startOfYear(new Date()), "yyyy-MM-dd"));
                  setEndDate(format(endOfDay(new Date()), "yyyy-MM-dd"));
                }}
              >
                This Year
              </Button>
            </div>
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              <Button
                variant="default"
                size="sm"
                onClick={handlePrint}
                className="h-9 px-3.5 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold hover:bg-slate-800 dark:hover:bg-amber-600 shadow-sm transition-all"
                title="Print official Executive Management Report"
              >
                <Printer className="mr-1.5 h-4 w-4 text-[#D4AF37] dark:text-slate-950" /> Print Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportExecutiveCSV}
                className="h-9 px-3 rounded-xl border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 shadow-2xs transition-all"
                title="Export executive metrics and KPIs to CSV"
              >
                <FileText className="mr-1.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Export CSV
              </Button>
            </div>
          </div>
        </div>

      {/* Top Luxury Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl p-5 bg-white dark:bg-[#151F2E] border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_25px_rgba(0,0,0,0.3)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-bl-full pointer-events-none"></div>
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-blue-600 dark:text-blue-400 mb-1">Total Bookings</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white font-display">{stats.total}</p>
        </div>

        <div className="rounded-2xl p-5 bg-white dark:bg-[#151F2E] border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_25px_rgba(0,0,0,0.3)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-bl-full pointer-events-none"></div>
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-400 mb-1">Confirmed Stays</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white font-display">{stats.confirmed}</p>
        </div>

        <div className="rounded-2xl p-5 bg-white dark:bg-[#151F2E] border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_25px_rgba(0,0,0,0.3)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-bl-full pointer-events-none"></div>
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-rose-600 dark:text-rose-400 mb-1">Cancelled</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white font-display">{stats.cancelled}</p>
        </div>

        <div className="rounded-2xl p-5 bg-white dark:bg-[#151F2E] border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_25px_rgba(0,0,0,0.3)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-bl-full pointer-events-none"></div>
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-amber-600 dark:text-amber-400 mb-1">No-Show Guests</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white font-display">{stats.noShow}</p>
        </div>

        <div className="rounded-2xl p-5 bg-gradient-to-br from-slate-900 to-slate-950 text-white border border-[#D4AF37]/30 shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 opacity-15 pointer-events-none">
            <BarChart3 className="w-24 h-24 -mb-4 -mr-4 text-[#D4AF37]" />
          </div>
          <p className="text-[10px] uppercase tracking-widest font-extrabold text-amber-300 mb-1">Total Period Revenue</p>
          <p className="text-3xl font-black text-white font-display">₱{stats.revenue.toLocaleString()}</p>
        </div>
      </div>


      {/* Secondary Stats Cards for Payment & Reservation Verification Audit */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Card className="p-4 bg-white dark:bg-[#151F2E] border-slate-200 dark:border-slate-800 shadow-sm border-l-4 border-l-emerald-500">
          <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-bold mb-0.5">Verified Payments</p>
          <p className="text-2xl font-black text-slate-800 dark:text-white font-mono">{stats.verifiedPayments}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Remittances audited & confirmed</p>
        </Card>
        <Card className="p-4 bg-white dark:bg-[#151F2E] border-slate-200 dark:border-slate-800 shadow-sm border-l-4 border-l-amber-500">
          <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold mb-0.5">Awaiting Verification</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">{stats.pendingPayments}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Payment proofs awaiting staff review</p>
        </Card>
        <Card className="p-4 bg-white dark:bg-[#151F2E] border-slate-200 dark:border-slate-800 shadow-sm border-l-4 border-l-blue-500">
          <p className="text-xs uppercase tracking-wider text-blue-700 dark:text-blue-400 font-bold mb-0.5">Pay at Resort</p>
          <p className="text-2xl font-black text-slate-800 dark:text-white font-mono">{stats.resortCount}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Front desk on-site settlement</p>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-4 print:break-inside-avoid">
        <Card className="p-6 lg:col-span-2 shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151F2E]">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Revenue Trend</h3>
          <div className="h-64 w-full">
            {dailyRevenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyRevenueData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} tickFormatter={(val) => `₱${val}`} />
                  <RechartsTooltip cursor={{ fill: 'rgba(51, 65, 85, 0.2)' }} contentStyle={{ borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }} />
                  <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">No revenue data for this period</div>
            )}
          </div>
        </Card>

        <Card className="p-6 shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151F2E]">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Booking Status</h3>
          <div className="h-64 w-full">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">No bookings found</div>
            )}
          </div>
        </Card>

        <Card className="p-6 shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151F2E]">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Payment Methods</h3>
          <div className="h-64 w-full">
            {paymentMethodData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentMethodData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    <Cell fill="#3b82f6" /> {/* GCash */}
                    <Cell fill="#f59e0b" /> {/* Resort */}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">No payment data</div>
            )}
          </div>
        </Card>
        <Card className="p-6 shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151F2E] lg:col-span-2 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white font-display">Cancellation Reasons</h3>
                {stats.cancelled > 0 && (
                  <Badge variant="outline" className="text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-700/60 font-bold text-xs">
                    {stats.cancelled} Total
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Stated customer reasons and administrative cancellation audits.
              </p>
            </div>
            <Link
              to="/admin/cancellations"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B38728] dark:text-[#FACC15] hover:text-[#8c671b] hover:underline transition-colors shrink-0"
            >
              Cancellations Log <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex-1 min-h-[220px]">
            {stats.cancellationReasonsData.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center h-full">
                {/* Donut Chart */}
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.cancellationReasonsData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {stats.cancellationReasonsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={REASON_COLORS[index % REASON_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: any, name: any) => [
                          `${value} booking${Number(value) === 1 ? "" : "s"} (${Math.round((Number(value) / stats.cancelled) * 100)}%)`,
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Ranked List Breakdown with percentage bars */}
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {stats.cancellationReasonsData.map((item, idx) => {
                    const pct = Math.round((item.value / stats.cancelled) * 100);
                    const color = REASON_COLORS[idx % REASON_COLORS.length];
                    return (
                      <div key={item.name} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs space-y-1.5">
                        <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-100">
                          <span className="flex items-center gap-1.5 truncate max-w-[170px]" title={item.name}>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          <span className="font-bold shrink-0 ml-2">
                            {item.value} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-200/80 dark:bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-56 text-center p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                {allTimeCancellations.length > 0 ? (
                  <>
                    <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No cancellations in selected date range</p>
                    <p className="text-xs text-slate-500 max-w-xs mt-1">
                      There are {allTimeCancellations.length} cancellations recorded in other reporting periods.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => {
                          setStartDate("2020-01-01");
                          setEndDate(format(endOfDay(new Date()), "yyyy-MM-dd"));
                        }}
                      >
                        Show All Dates
                      </Button>
                      <Link
                        to="/admin/cancellations"
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#B38728] hover:underline"
                      >
                        View Cancellations Tab
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Zero Cancellations Recorded</p>
                    <p className="text-xs text-slate-400 max-w-xs mt-1">
                      All reservations in the resort inventory are active, confirmed, or completed.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Data Tables Tabs */}
      <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151F2E] overflow-hidden print:shadow-none print:border-none">
        <Tabs defaultValue="bookings" className="w-full">
          <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 px-4 py-2 print:hidden">
            <TabsList className="bg-transparent space-x-2">
              <TabsTrigger value="bookings" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white text-slate-600 dark:text-slate-300 data-[state=active]:shadow-sm">
                <FileText className="w-4 h-4 mr-2" /> Booking Reports
              </TabsTrigger>
              <TabsTrigger value="occupancy" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white text-slate-600 dark:text-slate-300 data-[state=active]:shadow-sm">
                <BedDouble className="w-4 h-4 mr-2" /> Room Occupancy
              </TabsTrigger>
              <TabsTrigger value="customers" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white text-slate-600 dark:text-slate-300 data-[state=active]:shadow-sm">
                <Users className="w-4 h-4 mr-2" /> Customer Reports
              </TabsTrigger>
              <TabsTrigger value="deleted" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 text-rose-600 dark:text-rose-400 data-[state=active]:text-rose-700 dark:data-[state=active]:text-rose-300 font-medium">
                <History className="w-4 h-4 mr-2" /> Recently Deleted {allTrashItems.length > 0 && `(${allTrashItems.length})`}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-0">
            {/* BOOKINGS TABLE */}
            <TabsContent value="bookings" className="m-0 focus-visible:ring-0">
              <div className="p-4 flex items-center justify-between print:hidden bg-white dark:bg-[#151F2E] border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Reservation Records</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => {
                    const exportData = filteredBookings.map((b: any) => {
                      const p = b.payments?.[0];
                      let method = "Unknown";
                      try {
                        if (p?.notes) method = JSON.parse(p.notes).method;
                      } catch (e) {}

                      return {
                        "Booking ID": b.id,
                        "Customer Name": b.guest_name,
                        "Email": b.guest_email,
                        "Phone": b.guest_phone,
                        "Room Type": b.room?.type || "Unknown",
                        "Room Name": b.room?.name || "Unknown",
                        "Check-in": b.check_in,
                        "Check-out": b.check_out,
                        "Guests": b.guests,
                        "Amount (PHP)": b.total_amount,
                        "Payment Method": method === "gcash" ? "GCash" : method === "resort" ? "Pay at Resort" : "Unknown",
                        "Payment Status": p?.status || "Unpaid",
                        "Booking Status": b.status,
                      };
                    });
                    exportCSV(exportData, `Bookings_Report_${startDate}_${endDate}.csv`);
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <Table className="min-w-[1000px] print:w-full print:min-w-0">
                  <TableHeader className="bg-slate-50 dark:bg-slate-800/80">
                    <TableRow className="border-b border-slate-200 dark:border-slate-700">
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Customer</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Room</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Dates</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Method</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Payment</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No bookings found in this date range.</TableCell>
                      </TableRow>
                    ) : (
                      filteredBookings.map((b: any) => {
                        const p = b.payments?.[0];
                        let method = "unknown";
                        try {
                          if (p?.notes) method = JSON.parse(p.notes).method;
                        } catch(e){}

                        return (
                          <TableRow key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                            <TableCell>
                              <div className="font-medium text-slate-900 dark:text-white">{b.guest_name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{b.id.split("-")[0]}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-slate-900 dark:text-white">{b.room?.name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase">{b.room?.type}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-slate-800 dark:text-slate-200">{b.check_in}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">to {b.check_out}</div>
                            </TableCell>
                            <TableCell>
                              <span className="capitalize font-medium text-slate-700 dark:text-slate-300">
                                {method === "gcash" ? "GCash" : method === "resort" ? "At Resort" : "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                                {p?.status || "Unpaid"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">
                                {b.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* OCCUPANCY TABLE */}
            <TabsContent value="occupancy" className="m-0 focus-visible:ring-0 print:hidden">
               <div className="p-4 flex items-center justify-between bg-white dark:bg-[#151F2E] border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Room & Cottage Occupancy</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => {
                    exportCSV(roomOccupancyData, `Occupancy_Report_${startDate}_${endDate}.csv`);
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-800/80">
                    <TableRow className="border-b border-slate-200 dark:border-slate-700">
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Room / Cottage</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Type</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Times Booked</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Generated Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roomOccupancyData.map((r: any, i: number) => (
                      <TableRow key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                        <TableCell className="font-medium text-slate-900 dark:text-white">{r.name}</TableCell>
                        <TableCell className="uppercase text-xs font-semibold text-slate-500 dark:text-slate-400">{r.type}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.timesBooked} bookings</Badge>
                        </TableCell>
                        <TableCell className="font-bold text-primary">₱{r.revenue.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* CUSTOMERS TABLE */}
            <TabsContent value="customers" className="m-0 focus-visible:ring-0 print:hidden">
              <div className="p-4 flex items-center justify-between bg-white dark:bg-[#151F2E] border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Customer Reports</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => {
                    exportCSV(customerData, `Customers_Report_${startDate}_${endDate}.csv`);
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-800/80">
                    <TableRow className="border-b border-slate-200 dark:border-slate-700">
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Customer Name</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Contact Email</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Phone</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Total Bookings</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Total Spent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerData.map((c, i) => (
                      <TableRow key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                        <TableCell className="font-medium text-slate-900 dark:text-white">{c.name}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{c.email}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{c.phone}</TableCell>
                        <TableCell className="text-slate-800 dark:text-slate-200">{c.bookingsCount}</TableCell>
                        <TableCell className="font-bold text-primary">₱{c.totalSpent.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* RECENTLY DELETED TABLE */}
            <TabsContent value="deleted" className="m-0 focus-visible:ring-0 print:hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#151F2E] border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="font-semibold text-lg text-rose-700 dark:text-rose-400">Recently Deleted Records ({allTrashItems.length})</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Deleted bookings, accommodations, customer profiles, and inquiries that can be reviewed, restored, or permanently deleted.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium cursor-pointer"
                    disabled={isRefreshingDeleted || isTrashLoading}
                    onClick={handleRefreshDeleted}
                    title="Reload latest deleted records from the database"
                  >
                    <RefreshCcw className={cn("w-3.5 h-3.5 mr-1.5 text-slate-500 dark:text-slate-400", (isRefreshingDeleted || isTrashLoading) && "animate-spin text-slate-700 dark:text-slate-200")} />
                    {isRefreshingDeleted || isTrashLoading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[1000px]">
                  <TableHeader className="bg-slate-50 dark:bg-slate-800/80">
                    <TableRow className="border-b border-slate-200 dark:border-slate-700">
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Type</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Record Info</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Details / Dates</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Amount / Rate</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300">Deleted At</TableHead>
                      <TableHead className="font-bold text-slate-700 dark:text-slate-300 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allTrashItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <History className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No recently deleted records.</p>
                            <p className="text-xs text-slate-400 dark:text-slate-400 max-w-sm">
                              When you delete bookings, accommodations, profiles, or inquiries, they will appear here safely for restoration.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      allTrashItems.map((item) => (
                        <TableRow key={`${item.type}-${item.id}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                          <TableCell>
                            {item.type === "booking" ? (
                              <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700/60 font-bold text-[10px] uppercase">
                                Booking
                              </Badge>
                            ) : item.type === "room" ? (
                              <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/60 font-bold text-[10px] uppercase">
                                Accommodation
                              </Badge>
                            ) : item.type === "customer" ? (
                              <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700/60 font-bold text-[10px] uppercase">
                                Customer Profile
                              </Badge>
                            ) : item.type === "inquiry" ? (
                              <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/60 font-bold text-[10px] uppercase">
                                Customer Inquiry
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="capitalize font-bold text-[10px]">
                                {item.type}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900 dark:text-white">{item.title}</div>
                            {item.subtitle && <div className="text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-slate-800 dark:text-slate-200">{item.dates || "—"}</div>
                            {item.description && <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{item.description}</div>}
                          </TableCell>
                          <TableCell>
                            {item.amount !== undefined && item.amount > 0 ? (
                              <span className="font-medium text-slate-700 dark:text-slate-200">₱{item.amount.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-slate-800 dark:text-slate-200">
                              {item.deleted_at ? format(parseISO(item.deleted_at), "MMM d, yyyy") : ""}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {item.deleted_at ? format(parseISO(item.deleted_at), "h:mm a") : ""}
                              {item.deleted_by_name ? ` • by ${item.deleted_by_name}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 hover:text-emerald-800 dark:hover:text-emerald-200 font-semibold cursor-pointer h-8 px-2.5 rounded-lg shadow-2xs transition-colors"
                                onClick={() => restoreTrashItem(item)}
                                title="Restore this record back to its original module"
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400" /> Restore
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-rose-700 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 hover:text-rose-800 dark:hover:text-rose-200 font-semibold cursor-pointer h-8 px-2.5 rounded-lg shadow-2xs transition-colors"
                                onClick={() => permanentlyDeleteTrashItem(item)}
                                title="Permanently remove this record from the database"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-600 dark:text-rose-400" /> Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </Card>
      </div>

      {/* DEDICATED EXECUTIVE MANAGEMENT REPORT DOCUMENT: Visible ONLY when printing / downloading as PDF */}
      <div id="executive-report-document-container" className="hidden print:block w-full">
        <ExecutiveReportPrintDocument
          startDate={startDate}
          endDate={endDate}
          adminName={adminName}
          stats={stats}
          bookings={filteredBookings}
          roomOccupancyData={roomOccupancyData}
          customerData={customerData}
        />
      </div>
    </>
  );
}


