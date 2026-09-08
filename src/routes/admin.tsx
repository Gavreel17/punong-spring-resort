import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Users,
  CalendarCheck,
  PhilippinePeso,
  Database,
  Key,
  Copy,
  Percent,
  Calendar as CalendarIcon,
  Bed,
  CreditCard,
  LogOut,
  Home,
  Menu,
  X,
  FileText,
  Settings2,
  LayoutDashboard,
  BedDouble,
  Mail,
} from "lucide-react";
import { makeAdmin } from "@/lib/api/example.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Punong Spring Resort" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLoginPage = location.pathname === "/admin/login";

  // Pending payments count hook - called unconditionally at top of component
  const { data: pendingPaymentsCount } = useQuery({
    queryKey: ["pending-payments-count"],
    enabled: !isLoginPage && !!user && role === "admin",
    queryFn: async () => {
      const { count } = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count || 0;
    },
    refetchInterval: 30000,
  });

  // Unread customer inquiries count hook
  const { data: unreadInquiriesCount } = useQuery({
    queryKey: ["admin-unread-inquiries"],
    enabled: !isLoginPage && !!user && role === "admin",
    queryFn: async () => {
      const { count } = await supabase
        .from("inquiries")
        .select("*", { count: "exact", head: true })
        .or("status.eq.unread,status.eq.waiting_reply");
      return count || 0;
    },
    refetchInterval: 15000,
  });

  // Route protection hook
  useEffect(() => {
    if (isLoginPage || loading) return;

    if (!user) {
      navigate({ to: "/admin/login", replace: true });
    } else if (role !== "admin") {
      toast.error("Access denied. Admin privileges required.");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [user, role, loading, navigate, isLoginPage]);

  // Early returns AFTER ALL HOOKS HAVE BEEN EXECUTED
  if (isLoginPage) {
    return <Outlet />;
  }

  if (loading || !user || role !== "admin") {
    return (
      <div className="min-h-screen bg-[#060D10] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#D4AF37]">
          <div className="animate-spin h-8 w-8 border-2 border-[#D4AF37] border-t-transparent rounded-full"></div>
          <span className="text-xs font-semibold tracking-widest uppercase">Verifying Admin Access...</span>
        </div>
      </div>
    );
  }

  const links: { label: string; to: string; icon: any; badge?: number }[] = [
    { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Calendar", to: "/admin/calendar", icon: CalendarIcon },
    { label: "Bookings & Payments", to: "/admin/bookings", icon: CalendarCheck, badge: pendingPaymentsCount },
    { label: "Cancelled", to: "/admin/cancellations", icon: CalendarCheck },
    { label: "Rooms & Cottages", to: "/admin/rooms", icon: BedDouble },
    { label: "Customers", to: "/admin/customers", icon: Users },
    { label: "Messages & Inquiries", to: "/admin/messages", icon: Mail, badge: unreadInquiriesCount },
    { label: "Reports", to: "/admin/reports", icon: FileText },
    { label: "Settings", to: "/admin/settings", icon: Settings2 },
  ];

  const currentLink = links.find((link) => location.pathname === link.to) || links[0];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900/5 text-slate-900 w-full font-sans">
      {/* Desktop Luxury Sidebar */}
      <aside className="hidden md:flex md:w-72 md:flex-col bg-gradient-to-b from-[#081216] via-[#0D1C24] to-[#0A141A] text-slate-100 border-r border-[#D4AF37]/20 shadow-2xl z-20">
        {/* Brand Header */}
        <div className="flex h-20 items-center gap-3 px-6 border-b border-[#D4AF37]/15 bg-[#050C0E]/60 backdrop-blur-md">
          <div className="relative">
            <img src="/logo.png" alt="Punong Logo" className="h-10 w-10 object-contain rounded-full bg-white/10 p-1 ring-2 ring-[#D4AF37]/50 shadow-[0_0_15px_rgba(212,175,55,0.3)]" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#050C0E] rounded-full"></span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-lg font-bold tracking-wide text-white flex items-center gap-1.5">
              Punong <span className="text-[#D4AF37] font-serif italic">Resort</span>
            </span>
            <span className="text-[10px] tracking-widest uppercase text-amber-200/70 font-semibold">
              Luxury Admin Suite
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex flex-col flex-1 overflow-y-auto px-4 py-6 justify-between">
          <nav className="space-y-1.5">
            <div className="px-3 pb-2 text-[10px] uppercase font-bold tracking-widest text-slate-400/80">
              Management Menu
            </div>
            {links.map((link) => {
              const LinkIcon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                    isActive
                      ? "bg-gradient-to-r from-[#D4AF37]/20 to-emerald-500/10 text-amber-300 font-semibold border-l-4 border-[#D4AF37] shadow-[0_4px_20px_rgba(212,175,55,0.12)]"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 hover:translate-x-0.5",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <LinkIcon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", isActive ? "text-[#D4AF37]" : "text-slate-400")} />
                    <span>{link.label}</span>
                  </div>
                  {link.badge && link.badge > 0 && (
                    <span className="bg-gradient-to-r from-red-500 to-rose-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-md animate-pulse">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer Controls */}
          <div className="space-y-2 pt-6 border-t border-[#D4AF37]/15">
            <Link
              to="/"
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800/40 hover:text-amber-200 transition-all border border-transparent hover:border-[#D4AF37]/20"
            >
              <Home className="h-3.5 w-3.5 text-[#D4AF37]" />
              Return to Guest Site
            </Link>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-950/30 hover:text-rose-200 transition-all text-left cursor-pointer border border-transparent hover:border-rose-500/20"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-400" />
              Sign Out Portal
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex w-72 max-w-xs flex-col bg-[#081216] text-slate-100 border-r border-[#D4AF37]/20 animate-in slide-in-from-left duration-300 shadow-2xl">
            <div className="flex h-20 items-center justify-between px-6 border-b border-[#D4AF37]/15 bg-[#050C0E]">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Punong Logo" className="h-8 w-8 object-contain rounded-full bg-white/10 p-0.5 ring-1 ring-[#D4AF37]" />
                <span className="font-display text-lg font-bold tracking-wider text-white">
                  Punong Admin
                </span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-slate-400 hover:text-slate-100 focus:outline-none"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col flex-1 overflow-y-auto px-4 py-6 justify-between">
              <nav className="space-y-1.5">
                {links.map((link) => {
                  const LinkIcon = link.icon;
                  const isActive = location.pathname === link.to;
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-[#D4AF37]/20 text-amber-300 font-semibold border-l-4 border-[#D4AF37]"
                          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <LinkIcon className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                        {link.label}
                      </div>
                      {link.badge && link.badge > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                          {link.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="space-y-2 pt-6 border-t border-slate-800">
                <Link
                  to="/"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800/40 hover:text-slate-100"
                >
                  <Home className="h-3.5 w-3.5" />
                  Public Site
                </Link>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-950/20 hover:text-red-300 text-left"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Pane */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Luxury Top Header */}
        <header className="flex h-20 items-center justify-between border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-6 md:px-8 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-slate-600 hover:text-slate-900 focus:outline-none md:hidden p-1.5 rounded-lg bg-slate-100"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#B38728]">
                  Management Suite
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[10px] font-semibold text-slate-400">Resort Live</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 font-display capitalize">
                {currentLink.label} Control Panel
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Clock Widget */}
            {timeStr && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/5 border border-slate-200/80 text-xs font-mono text-slate-700 shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="font-semibold">{timeStr} PHT</span>
              </div>
            )}

            {/* Admin Active Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Admin Active
            </div>

            {/* User Profile Avatar Pill */}
            <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-sm font-semibold text-slate-900">
                  {user?.email?.split("@")[0]}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Administrator</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#081216] to-[#0D1C24] text-[#D4AF37] flex items-center justify-center font-bold text-sm border-2 border-[#D4AF37]/50 shadow-md ring-2 ring-[#D4AF37]/20">
                {user?.email?.[0].toUpperCase() || "A"}
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Dashboard Canvas */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/60">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Display Stats Row only when Calendar or Bookings tabs are active */}
            {["/admin/calendar", "/admin/bookings"].includes(location.pathname) && (
              <div className="mb-4">
                <StatsRow />
              </div>
            )}

            {/* Subpage Container */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_10px_35px_rgba(0,0,0,0.03)] p-6 md:p-8 min-h-[550px] relative">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatsRow() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const [b, c, r, p] = await Promise.all([
        supabase.from("bookings").select("id,status,total_amount,check_in,check_out,room_id"),
        supabase.from("profiles").select("id"),
        supabase.from("rooms").select("id,is_available,maintenance_start,maintenance_end"),
        supabase.from("payments").select("amount,status"),
      ]);
      const totalRevenue = (p.data ?? [])
        .filter((x: any) => x.status === "verified")
        .reduce((s: number, x: any) => s + Number(x.amount), 0);

      const allRooms = r.data || [];
      const totalRooms = allRooms.length;
      let occupied = 0;

      allRooms.forEach((room: any) => {
        let isOccupied = false;
        if (room.maintenance_start && room.maintenance_end) {
          if (todayStr >= room.maintenance_start && todayStr < room.maintenance_end)
            isOccupied = true;
        }
        if (!isOccupied) {
          const roomBookings = (b.data || []).filter(
            (bk: any) => bk.room_id === room.id && bk.status === "approved",
          );
          for (const bk of roomBookings) {
            if (todayStr >= bk.check_in && todayStr < bk.check_out) {
              isOccupied = true;
              break;
            }
          }
        }
        if (isOccupied) occupied++;
      });

      const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

      return {
        totalBookings: b.data?.length ?? 0,
        customers: c.data?.length ?? 0,
        occupancyRate,
        revenue: totalRevenue,
      };
    },
  });

  const stats = [
    { 
      label: "Total Reservations", 
      value: data?.totalBookings ?? 0, 
      icon: CalendarCheck, 
      color: "from-amber-500/20 to-amber-600/10 text-amber-700 border-amber-300/30",
      iconBg: "bg-amber-500 text-white"
    },
    { 
      label: "Occupancy Rate", 
      value: `${data?.occupancyRate ?? 0}%`, 
      icon: Percent, 
      color: "from-blue-500/20 to-cyan-600/10 text-blue-700 border-blue-300/30",
      iconBg: "bg-blue-600 text-white"
    },
    { 
      label: "Resort Guests", 
      value: data?.customers ?? 0, 
      icon: Users, 
      color: "from-emerald-500/20 to-teal-600/10 text-emerald-700 border-emerald-300/30",
      iconBg: "bg-emerald-600 text-white"
    },
    {
      label: "Verified Revenue",
      value: `₱${(data?.revenue ?? 0).toLocaleString()}`,
      icon: PhilippinePeso,
      color: "from-yellow-500/20 via-amber-500/10 to-[#D4AF37]/20 text-slate-900 border-[#D4AF37]/30",
      iconBg: "bg-gradient-to-br from-[#B38728] to-[#D4AF37] text-white shadow-md"
    },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <div 
          key={s.label} 
          className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-300 group"
        >
          <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${s.color} rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none`}></div>
          <div className="flex items-center gap-4 relative z-10">
            <div className={`rounded-xl ${s.iconBg} p-3.5 shadow-md shrink-0 group-hover:scale-110 transition-transform duration-300`}>
              <s.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-600">{s.label}</p>
              <p className="text-2xl font-extrabold text-slate-900 font-display mt-0.5">{s.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

