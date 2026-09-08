import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, parseISO, startOfMonth } from "date-fns";
import {
  CalendarCheck,
  Users,
  PhilippinePeso,
  Percent,
  BedDouble,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  CalendarDays,
  Star,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Admin | Punong Spring Resort" }] }),
  component: AdminDashboard,
});

// ─── Helper ────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
    pending: "bg-amber-100 text-amber-800 border-amber-300",
    completed: "bg-blue-100 text-blue-800 border-blue-300",
    cancelled: "bg-rose-100 text-rose-800 border-rose-200",
    rejected: "bg-rose-100 text-rose-800 border-rose-200",
    "no-show": "bg-slate-100 text-slate-600 border-slate-300",
  };
  return map[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
}

// ─── Main Component ─────────────────────────────────────────────────────────

function AdminDashboard() {
  const todayStr = new Date().toISOString().split("T")[0];
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  // ── Data Fetches ────────────────────────────────────────────────────────
  const { data: bookings, isLoading: loadingBookings } = useQuery({
    queryKey: ["dashboard-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,status,total_amount,check_in,check_out,created_at,guest_name,room_id,room:rooms(name,type)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
    retry: 1,
  });

  const { data: rooms } = useQuery({
    queryKey: ["dashboard-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id,name,type,is_available,maintenance_start,maintenance_end");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
    retry: 1,
  });

  const { data: pendingPayments } = useQuery({
    queryKey: ["dashboard-pending-payments"],
    queryFn: async () => {
      const { count } = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    refetchInterval: 30000,
    retry: 1,
  });

  const { data: customers } = useQuery({
    queryKey: ["dashboard-customers"],
    queryFn: async () => {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
    retry: 1,
  });

  const { data: feedbacks } = useQuery({
    queryKey: ["dashboard-feedbacks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedbacks")
        .select("rating,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
  });

  // ── Derived Stats ───────────────────────────────────────────────────────

  const allBookings = bookings ?? [];
  const allRooms = rooms ?? [];

  const totalBookings = allBookings.length;
  const pendingCount = allBookings.filter((b: any) => b.status === "pending").length;
  const approvedCount = allBookings.filter((b: any) => b.status === "approved").length;
  const cancelledCount = allBookings.filter((b: any) => b.status === "cancelled" || b.status === "rejected").length;

  // Revenue (approved + completed)
  const totalRevenue = allBookings
    .filter((b: any) => b.status === "approved" || b.status === "completed")
    .reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);

  // This-month bookings
  const monthBookings = allBookings.filter(
    (b: any) => b.created_at >= monthStart
  ).length;

  // Today's check-ins
  const todayCheckIns = allBookings.filter(
    (b: any) => b.check_in === todayStr && b.status === "approved"
  ).length;

  // Today's check-outs
  const todayCheckOuts = allBookings.filter(
    (b: any) => b.check_out === todayStr && b.status === "approved"
  ).length;

  // Occupancy rate (rooms currently occupied)
  let occupiedCount = 0;
  allRooms.forEach((room: any) => {
    let isOccupied = false;
    if (room.maintenance_start && room.maintenance_end) {
      if (todayStr >= room.maintenance_start && todayStr < room.maintenance_end)
        isOccupied = true;
    }
    if (!isOccupied) {
      const roomBookings = allBookings.filter(
        (bk: any) => bk.room_id === room.id && bk.status === "approved"
      );
      for (const bk of roomBookings) {
        if (todayStr >= bk.check_in && todayStr < bk.check_out) {
          isOccupied = true;
          break;
        }
      }
    }
    if (isOccupied) occupiedCount++;
  });
  const occupancyRate =
    allRooms.length > 0 ? Math.round((occupiedCount / allRooms.length) * 100) : 0;

  // Average review rating
  const avgRating =
    feedbacks && feedbacks.length > 0
      ? (feedbacks.reduce((s: number, f: any) => s + Number(f.rating), 0) / feedbacks.length).toFixed(1)
      : "—";

  // Recent 8 bookings
  const recentBookings = allBookings.slice(0, 8);

  // ── KPI Cards ──────────────────────────────────────────────────────────

  const kpis = [
    {
      label: "Total Reservations",
      value: totalBookings,
      sub: `+${monthBookings} this month`,
      icon: CalendarCheck,
      gradient: "from-amber-500/20 to-amber-600/10",
      iconBg: "bg-amber-500",
      textColor: "text-amber-700",
    },
    {
      label: "Occupancy Rate",
      value: `${occupancyRate}%`,
      sub: `${occupiedCount} of ${allRooms.length} rooms`,
      icon: Percent,
      gradient: "from-blue-500/20 to-cyan-600/10",
      iconBg: "bg-blue-600",
      textColor: "text-blue-700",
    },
    {
      label: "Resort Guests",
      value: customers ?? 0,
      sub: "registered accounts",
      icon: Users,
      gradient: "from-emerald-500/20 to-teal-600/10",
      iconBg: "bg-emerald-600",
      textColor: "text-emerald-700",
    },
    {
      label: "Verified Revenue",
      value: `₱${totalRevenue.toLocaleString()}`,
      sub: "approved + completed",
      icon: PhilippinePeso,
      gradient: "from-yellow-500/20 to-[#D4AF37]/20",
      iconBg: "bg-gradient-to-br from-[#B38728] to-[#D4AF37]",
      textColor: "text-slate-900",
    },
  ];

  // ── Booking Status Breakdown ───────────────────────────────────────────

  const statusBreakdown = [
    { label: "Confirmed / Active", count: approvedCount, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    { label: "Cancelled", count: cancelledCount, icon: XCircle, color: "text-rose-500 bg-rose-50 border-rose-200" },
    { label: "Awaiting Payments", count: pendingPayments ?? 0, icon: AlertCircle, color: "text-orange-600 bg-orange-50 border-orange-200" },
  ];

  // ── Quick-Action Links ─────────────────────────────────────────────────

  const quickLinks = [
    { label: "View Calendar", to: "/admin/calendar", icon: CalendarDays, desc: "Monthly booking overview" },
    { label: "Bookings & Payments", to: "/admin/bookings", icon: CalendarCheck, desc: "Review & verify payments" },
    { label: "Rooms & Cottages", to: "/admin/rooms", icon: BedDouble, desc: "Manage availability" },
    { label: "Customers", to: "/admin/customers", icon: Users, desc: "Guest profiles" },
    { label: "Reports", to: "/admin/reports", icon: BarChart3, desc: "Analytics & exports" },
    { label: "Cancelled", to: "/admin/cancellations", icon: XCircle, desc: "Process refunds" },
  ];

  // Never block the whole page — show skeleton KPIs while the primary query resolves.
  // If the query errored, allBookings stays [] so we still render meaningful UI.

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* ── Page Title ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
              Overview
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
            Resort Performance Dashboard
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            At-a-glance overview of bookings, revenue, occupancy, and operations.
          </p>
        </div>

        {/* Today's activity pills */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
            <Activity className="w-3.5 h-3.5" />
            {todayCheckIns} Check-in{todayCheckIns !== 1 ? "s" : ""} Today
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
            <TrendingUp className="w-3.5 h-3.5" />
            {todayCheckOuts} Check-out{todayCheckOuts !== 1 ? "s" : ""} Today
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-300 group"
            >
              <div
                className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${kpi.gradient} rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none`}
              />
              <div className="flex items-center gap-4 relative z-10">
                <div className={`rounded-xl ${kpi.iconBg} p-3.5 shadow-md shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                    {kpi.label}
                  </p>
                  <p className="text-2xl font-extrabold text-slate-900 font-display mt-0.5">
                    {kpi.value}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{kpi.sub}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Status Breakdown + Quick Actions ───────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">

        {/* Status Breakdown (2 cols wide) */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Booking Status
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Live Counts
            </span>
          </div>
          <div className="space-y-3">
            {statusBreakdown.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border ${s.color}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-semibold">{s.label}</span>
                  </div>
                  <span className="text-2xl font-black font-display">{s.count}</span>
                </div>
              );
            })}

            {/* Rating row */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-700">
              <div className="flex items-center gap-2.5">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-semibold">Avg. Guest Rating</span>
              </div>
              <span className="text-2xl font-black font-display">{avgRating}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions (3 cols wide) */}
        <div className="lg:col-span-3 rounded-2xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Quick Navigation
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Shortcuts
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="group flex items-center gap-3 p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-gradient-to-r hover:from-[#D4AF37]/10 hover:to-amber-50/30 hover:border-[#D4AF37]/40 transition-all duration-200 hover:shadow-sm"
                >
                  <div className="w-9 h-9 rounded-lg bg-white shadow-sm border border-slate-200/80 flex items-center justify-center shrink-0 group-hover:bg-[#D4AF37]/15 group-hover:border-[#D4AF37]/30 transition-all">
                    <Icon className="w-4 h-4 text-slate-600 group-hover:text-[#B38728]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 group-hover:text-slate-900 truncate">
                      {link.label}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium truncate">{link.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#D4AF37] shrink-0 -translate-x-1 group-hover:translate-x-0 transition-transform" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Occupancy Overview ─────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 font-display">
              Room & Cottage Availability
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Current occupancy status as of today</p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 text-xs font-bold rounded-xl border-slate-200 hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5"
          >
            <Link to="/admin/rooms">
              Manage Rooms <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {allRooms.length === 0 ? (
            <div className="col-span-full py-8 text-center text-slate-400 text-sm">
              No rooms found.
            </div>
          ) : (
            allRooms.map((room: any) => {
              // Determine status
              let occupied = false;
              let inMaintenance = false;

              if (room.maintenance_start && room.maintenance_end) {
                if (todayStr >= room.maintenance_start && todayStr < room.maintenance_end)
                  inMaintenance = true;
              }

              if (!inMaintenance) {
                const activeBooking = allBookings.find(
                  (bk: any) =>
                    bk.room_id === room.id &&
                    bk.status === "approved" &&
                    todayStr >= bk.check_in &&
                    todayStr < bk.check_out
                );
                if (activeBooking) occupied = true;
              }

              const badge = inMaintenance
                ? { label: "Maintenance", cls: "bg-orange-100 text-orange-700 border-orange-200" }
                : occupied
                ? { label: "Occupied", cls: "bg-rose-100 text-rose-700 border-rose-200" }
                : { label: "Available", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };

              return (
                <div
                  key={room.id}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60"
                >
                  <div className={cn(
                    "w-2.5 h-2.5 rounded-full shrink-0",
                    inMaintenance ? "bg-orange-400" : occupied ? "bg-rose-500" : "bg-emerald-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{room.name}</p>
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wide">{room.type}</p>
                  </div>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", badge.cls)}>
                    {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Recent Bookings ────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 font-display">Recent Reservations</h3>
            <p className="text-xs text-slate-400 mt-0.5">Latest 8 booking entries</p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 text-xs font-bold rounded-xl border-slate-200 hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5"
          >
            <Link to="/admin/bookings">
              All Bookings <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>

        <div className="divide-y divide-slate-100">
          {recentBookings.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No bookings yet.
            </div>
          ) : (
            recentBookings.map((b: any) => (
              <div
                key={b.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/80 transition-colors"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#081216] to-[#1a2e3a] text-[#D4AF37] font-bold text-sm flex items-center justify-center shrink-0 border border-[#D4AF37]/30">
                  {b.guest_name?.[0]?.toUpperCase() ?? "?"}
                </div>

                {/* Guest + Room */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{b.guest_name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {(b as any).room?.name ?? "—"} &bull; {b.check_in} → {b.check_out}
                  </p>
                </div>

                {/* Amount */}
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-extrabold text-[#B38728] font-display">
                    ₱{Number(b.total_amount).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {format(parseISO(b.created_at), "MMM d, yyyy")}
                  </p>
                </div>

                {/* Status */}
                <Badge
                  className={cn(
                    "capitalize text-[10px] font-bold px-2.5 py-0.5 rounded-full border hidden md:flex",
                    statusBadge(b.status)
                  )}
                >
                  {b.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
