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
import { FileDown, Printer, FileText, BarChart3, Users, BedDouble, History, RefreshCcw, Trash2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ExecutiveReportPrintDocument } from "@/components/ExecutiveReportPrintDocument";

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

  const { data: allTrashItems = [] } = useQuery({
    queryKey: ["admin-trash-all"],
    queryFn: async () => {
      return await trashService.getAllDeleted();
    },
  });

  const restoreTrashItem = async (item: TrashItem) => {
    const res = await trashService.restore(item);
    if (!res.success) {
      toast.error(res.message || "Failed to restore record.");
    } else {
      toast.success(`${item.title} restored!`);
      qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
      qc.invalidateQueries({ queryKey: ["reports-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
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

      // Payment Stats
      const p = b.payments?.[0];
      let method = "unknown";
      if (p?.notes) {
        try {
          const parsed = typeof p.notes === "string" ? JSON.parse(p.notes) : p.notes;
          method = parsed.method;
        } catch (e) {}
      }

      if (method === "gcash") gcashCount++;
      if (method === "resort") resortCount++;

      if (p?.status === "verified") verifiedPayments++;
      else if (p?.status === "pending") pendingPayments++;
      else if (p?.status === "rejected") rejectedPayments++;
      else if (p?.status === "refund_pending") refundPending++;
      else if (p?.status === "refunded") refunded++;
      else if (p?.status === "non-refundable") nonRefundable++;
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

  const handleSavePdf = () => {
    toast.info("Opening Print preview: choose 'Save as PDF' under Destination to export.", {
      duration: 4000,
    });
    handlePrint();
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
            <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight mt-1 flex items-center gap-2">
              Reports & Performance Intelligence
            </h2>
            <p className="text-sm text-slate-500">Analyze revenue streams, room occupancy rates, guest payment trends, and historical logs.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-200/80">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 h-9 rounded-xl border-slate-200 bg-white text-xs"
              />
              <span className="text-xs text-slate-400 font-semibold">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 h-9 rounded-xl border-slate-200 bg-white text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 rounded-xl text-xs font-semibold hover:bg-white"
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
                className="h-9 px-3 rounded-xl text-xs font-semibold hover:bg-white"
                onClick={() => {
                  setStartDate(format(startOfYear(new Date()), "yyyy-MM-dd"));
                  setEndDate(format(endOfDay(new Date()), "yyyy-MM-dd"));
                }}
              >
                This Year
              </Button>
            </div>
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <Button
                variant="default"
                size="sm"
                onClick={handlePrint}
                className="h-9 px-3.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 shadow-sm transition-all"
                title="Print official Executive Management Report"
              >
                <Printer className="mr-1.5 h-4 w-4 text-[#D4AF37]" /> Print Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSavePdf}
                className="h-9 px-3 rounded-xl border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 shadow-2xs transition-all"
                title="Save report directly as PDF document"
              >
                <FileDown className="mr-1.5 h-4 w-4 text-rose-600" /> Save as PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportExecutiveCSV}
                className="h-9 px-3 rounded-xl border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 shadow-2xs transition-all"
                title="Export executive metrics and KPIs to CSV"
              >
                <FileText className="mr-1.5 h-4 w-4 text-emerald-600" /> Export CSV
              </Button>
            </div>
          </div>
        </div>

      {/* Top Luxury Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl p-5 bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-bl-full pointer-events-none"></div>
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-blue-600 mb-1">Total Bookings</p>
          <p className="text-3xl font-black text-slate-900 font-display">{stats.total}</p>
        </div>

        <div className="rounded-2xl p-5 bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-bl-full pointer-events-none"></div>
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-600 mb-1">Confirmed Stays</p>
          <p className="text-3xl font-black text-slate-900 font-display">{stats.confirmed}</p>
        </div>

        <div className="rounded-2xl p-5 bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-bl-full pointer-events-none"></div>
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-rose-600 mb-1">Cancelled</p>
          <p className="text-3xl font-black text-slate-900 font-display">{stats.cancelled}</p>
        </div>

        <div className="rounded-2xl p-5 bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-bl-full pointer-events-none"></div>
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-amber-600 mb-1">No-Show Guests</p>
          <p className="text-3xl font-black text-slate-900 font-display">{stats.noShow}</p>
        </div>

        <div className="rounded-2xl p-5 bg-gradient-to-br from-slate-900 to-slate-950 text-white border border-[#D4AF37]/30 shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 opacity-15 pointer-events-none">
            <BarChart3 className="w-24 h-24 -mb-4 -mr-4 text-[#D4AF37]" />
          </div>
          <p className="text-[10px] uppercase tracking-widest font-extrabold text-amber-300 mb-1">Total Period Revenue</p>
          <p className="text-3xl font-black text-white font-display">₱{stats.revenue.toLocaleString()}</p>
        </div>
      </div>


      {/* Secondary Stats Cards for Payments */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        <Card className="p-4 bg-white border-slate-200 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Awaiting Payments</p>
          <p className="text-2xl font-black text-slate-800">{stats.pendingPayments}</p>
        </Card>
        <Card className="p-4 bg-white border-slate-200 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-600 font-bold mb-1">Pay at Resort</p>
          <p className="text-2xl font-black text-slate-800">{stats.resortCount}</p>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-4 print:break-inside-avoid">
        <Card className="p-6 lg:col-span-2 shadow-sm border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Revenue Trend</h3>
          <div className="h-64 w-full">
            {dailyRevenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyRevenueData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(val) => `₱${val}`} />
                  <RechartsTooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">No revenue data for this period</div>
            )}
          </div>
        </Card>

        <Card className="p-6 shadow-sm border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Booking Status</h3>
          <div className="h-64 w-full">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">No bookings found</div>
            )}
          </div>
        </Card>

        <Card className="p-6 shadow-sm border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Payment Methods</h3>
          <div className="h-64 w-full">
            {paymentMethodData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentMethodData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    <Cell fill="#3b82f6" /> {/* GCash */}
                    <Cell fill="#f59e0b" /> {/* Resort */}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">No payment data</div>
            )}
          </div>
        </Card>
        <Card className="p-6 shadow-sm border-slate-200 lg:col-span-2 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800 font-display">Cancellation Reasons</h3>
                {stats.cancelled > 0 && (
                  <Badge variant="outline" className="text-rose-700 bg-rose-50 border-rose-200 font-bold text-xs">
                    {stats.cancelled} Total
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Stated customer reasons and administrative cancellation audits.
              </p>
            </div>
            <Link
              to="/admin/cancellations"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B38728] hover:text-[#8c671b] hover:underline transition-colors shrink-0"
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
                      <div key={item.name} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                        <div className="flex items-center justify-between font-semibold text-slate-800">
                          <span className="flex items-center gap-1.5 truncate max-w-[170px]" title={item.name}>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          <span className="font-bold shrink-0 ml-2">
                            {item.value} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
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
              <div className="flex flex-col items-center justify-center h-56 text-center p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                {allTimeCancellations.length > 0 ? (
                  <>
                    <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No cancellations in selected date range</p>
                    <p className="text-xs text-slate-500 max-w-xs mt-1">
                      There are {allTimeCancellations.length} cancellations recorded in other reporting periods.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold rounded-lg bg-white shadow-2xs hover:bg-slate-100"
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
                    <p className="text-sm font-semibold text-slate-700">Zero Cancellations Recorded</p>
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
      <Card className="shadow-sm border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <Tabs defaultValue="bookings" className="w-full">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 print:hidden">
            <TabsList className="bg-transparent space-x-2">
              <TabsTrigger value="bookings" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <FileText className="w-4 h-4 mr-2" /> Booking Reports
              </TabsTrigger>
              <TabsTrigger value="occupancy" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <BedDouble className="w-4 h-4 mr-2" /> Room Occupancy
              </TabsTrigger>
              <TabsTrigger value="customers" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Users className="w-4 h-4 mr-2" /> Customer Reports
              </TabsTrigger>
              <TabsTrigger value="deleted" className="data-[state=active]:bg-white data-[state=active]:shadow-sm text-red-600 data-[state=active]:text-red-700">
                <History className="w-4 h-4 mr-2" /> Recently Deleted
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-0">
            {/* BOOKINGS TABLE */}
            <TabsContent value="bookings" className="m-0 focus-visible:ring-0">
              <div className="p-4 flex items-center justify-between print:hidden bg-white border-b">
                <h3 className="font-semibold text-lg">Reservation Records</h3>
                <Button
                  size="sm"
                  variant="outline"
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
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-700">Customer</TableHead>
                      <TableHead className="font-bold text-slate-700">Room</TableHead>
                      <TableHead className="font-bold text-slate-700">Dates</TableHead>
                      <TableHead className="font-bold text-slate-700">Method</TableHead>
                      <TableHead className="font-bold text-slate-700">Payment</TableHead>
                      <TableHead className="font-bold text-slate-700">Status</TableHead>
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
                          <TableRow key={b.id}>
                            <TableCell>
                              <div className="font-medium text-slate-900">{b.guest_name}</div>
                              <div className="text-xs text-slate-500">{b.id.split("-")[0]}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{b.room?.name}</div>
                              <div className="text-xs text-slate-500 uppercase">{b.room?.type}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{b.check_in}</div>
                              <div className="text-sm text-slate-500">to {b.check_out}</div>
                            </TableCell>
                            <TableCell>
                              <span className="capitalize font-medium text-slate-600">
                                {method === "gcash" ? "GCash" : method === "resort" ? "At Resort" : "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize bg-slate-50">
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
               <div className="p-4 flex items-center justify-between bg-white border-b">
                <h3 className="font-semibold text-lg">Room & Cottage Occupancy</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    exportCSV(roomOccupancyData, `Occupancy_Report_${startDate}_${endDate}.csv`);
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-700">Room / Cottage</TableHead>
                      <TableHead className="font-bold text-slate-700">Type</TableHead>
                      <TableHead className="font-bold text-slate-700">Times Booked</TableHead>
                      <TableHead className="font-bold text-slate-700">Generated Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roomOccupancyData.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-slate-900">{r.name}</TableCell>
                        <TableCell className="uppercase text-xs font-semibold text-slate-500">{r.type}</TableCell>
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
              <div className="p-4 flex items-center justify-between bg-white border-b">
                <h3 className="font-semibold text-lg">Customer Reports</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    exportCSV(customerData, `Customers_Report_${startDate}_${endDate}.csv`);
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-700">Customer Name</TableHead>
                      <TableHead className="font-bold text-slate-700">Contact Email</TableHead>
                      <TableHead className="font-bold text-slate-700">Phone</TableHead>
                      <TableHead className="font-bold text-slate-700">Total Bookings</TableHead>
                      <TableHead className="font-bold text-slate-700">Total Spent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerData.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-slate-900">{c.name}</TableCell>
                        <TableCell>{c.email}</TableCell>
                        <TableCell>{c.phone}</TableCell>
                        <TableCell>{c.bookingsCount}</TableCell>
                        <TableCell className="font-bold text-primary">₱{c.totalSpent.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* RECENTLY DELETED TABLE */}
            <TabsContent value="deleted" className="m-0 focus-visible:ring-0 print:hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border-b">
                <div>
                  <h3 className="font-semibold text-lg text-rose-700">Recently Deleted Records ({allTrashItems.length})</h3>
                  <p className="text-xs text-slate-500">Deleted bookings, accommodations, customer profiles, and inquiries that can be reviewed or restored.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-slate-300 text-slate-700 hover:bg-slate-100"
                    onClick={() => qc.invalidateQueries({ queryKey: ["admin-trash-all"] })}
                  >
                    <RefreshCcw className="w-3.5 h-3.5 mr-1.5 text-slate-500" /> Refresh
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[1000px]">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-700">Type</TableHead>
                      <TableHead className="font-bold text-slate-700">Record Info</TableHead>
                      <TableHead className="font-bold text-slate-700">Details / Dates</TableHead>
                      <TableHead className="font-bold text-slate-700">Amount / Rate</TableHead>
                      <TableHead className="font-bold text-slate-700">Deleted At</TableHead>
                      <TableHead className="font-bold text-slate-700 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allTrashItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No recently deleted records.</TableCell>
                      </TableRow>
                    ) : (
                      allTrashItems.map((item) => (
                        <TableRow key={`${item.type}-${item.id}`}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize font-bold text-[10px]">
                              {item.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900">{item.title}</div>
                            {item.subtitle && <div className="text-xs text-slate-500">{item.subtitle}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{item.dates || "—"}</div>
                            {item.description && <div className="text-xs text-slate-500 line-clamp-1">{item.description}</div>}
                          </TableCell>
                          <TableCell>
                            {item.amount !== undefined && item.amount > 0 ? (
                              <span className="font-medium text-slate-700">₱{item.amount.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {item.deleted_at ? format(parseISO(item.deleted_at), "MMM d, yyyy") : ""}
                            </div>
                            <div className="text-xs text-slate-500">
                              {item.deleted_at ? format(parseISO(item.deleted_at), "h:mm a") : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 font-semibold cursor-pointer"
                              onClick={() => restoreTrashItem(item)}
                            >
                              <RefreshCcw className="w-4 h-4 mr-1.5" /> Restore
                            </Button>
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

      {/* DEDICATED EXECUTIVE MANAGEMENT REPORT DOCUMENT: Visible ONLY when printing / saving as PDF */}
      <div className="hidden print:block w-full">
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
