import { CalendarCheck, Percent, Users, PhilippinePeso } from "lucide-react";
import { useAdminStats } from "@/hooks/use-admin-stats";

interface AdminStatsRowProps {
  showSubtitles?: boolean;
  className?: string;
}

export function AdminStatsRow({ showSubtitles = false, className = "" }: AdminStatsRowProps) {
  const stats = useAdminStats();

  const cards = [
    {
      label: "TOTAL RESERVATIONS",
      value: stats.totalBookings.toLocaleString(),
      sub: `+${stats.monthBookings} this month`,
      icon: CalendarCheck,
      color: "from-amber-500/20 to-amber-600/10 text-amber-700 border-amber-300/30",
      iconBg: "bg-amber-500 text-white",
    },
    {
      label: "OCCUPANCY RATE",
      value: `${stats.occupancyRate}%`,
      sub: `${stats.occupiedRoomsCount} of ${stats.totalRoomsCount} rooms`,
      icon: Percent,
      color: "from-blue-500/20 to-cyan-600/10 text-blue-700 border-blue-300/30",
      iconBg: "bg-blue-600 text-white",
    },
    {
      label: "RESORT GUESTS",
      value: stats.resortGuests.toLocaleString(),
      sub: "registered accounts",
      icon: Users,
      color: "from-emerald-500/20 to-teal-600/10 text-emerald-700 border-emerald-300/30",
      iconBg: "bg-emerald-600 text-white",
    },
    {
      label: "VERIFIED REVENUE",
      value: `₱${stats.totalRevenue.toLocaleString()}`,
      sub: "approved & completed",
      icon: PhilippinePeso,
      color: "from-yellow-500/20 via-amber-500/10 to-[#D4AF37]/20 text-slate-900 border-[#D4AF37]/30",
      iconBg: "bg-gradient-to-br from-[#B38728] to-[#D4AF37] text-white shadow-md",
    },
  ];

  return (
    <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-300 group"
          >
            <div
              className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${c.color} rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none`}
            />
            <div className="flex items-center gap-4 relative z-10">
              <div
                className={`rounded-xl ${c.iconBg} p-3.5 shadow-md shrink-0 group-hover:scale-110 transition-transform duration-300`}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-600 truncate">
                  {c.label}
                </p>
                <p className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5 font-sans">
                  {c.value}
                </p>
                {showSubtitles && (
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium truncate">
                    {c.sub}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
