import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Users, Search, Info, ShieldAlert, Calendar, CalendarX, X } from "lucide-react";
import { enrichRoomWithRateType } from "@/lib/rate-type-helper";
import { ResortBlockedModal, formatBlockDateRange } from "@/components/ResortBlockedModal";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Rooms & Cottages — Punong Spring Resort" },
      {
        name: "description",
        content: "Browse rooms, cottages and function halls at Punong Spring Resort.",
      },
    ],
  }),
  component: RoomsPage,
});

function RoomsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [checkIn, setCheckIn] = useState<string>("");
  const [checkOut, setCheckOut] = useState<string>("");

  // Modal alert state for blocked resort dates
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);

  // Today's date string YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // 1. Fetch Rooms & Cottages
  const { data: roomsData, isLoading: roomsLoading } = useQuery({
    queryKey: ["rooms-and-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("price");
      if (error) throw error;
      return (data || []).map(enrichRoomWithRateType);
    },
  });

  // 2. Fetch Active Resort-Wide Blocks
  const { data: blocks = [] } = useQuery({
    queryKey: ["public-resort-blocks"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("resort_blocks" as any)
          .select("id, start_date, end_date, reason")
          .order("start_date", { ascending: true });
        if (error) throw error;
        return (data || []) as any[];
      } catch (e) {
        console.warn("Could not fetch resort_blocks:", e);
        return [] as any[];
      }
    },
    refetchInterval: 6000,
  });

  // 3. Real-time synchronization for rooms AND resort_blocks
  useEffect(() => {
    const channel = supabase
      .channel("customer-rooms-and-blocks-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        () => {
          qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resort_blocks" },
        () => {
          qc.invalidateQueries({ queryKey: ["public-resort-blocks"] });
        }
      )
      .subscribe();

    const handleRateTypeChange = () => {
      qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
    };
    window.addEventListener("punong-rate-type-changed", handleRateTypeChange);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("punong-rate-type-changed", handleRateTypeChange);
    };
  }, [qc]);

  const rooms = roomsData || [];

  const filtered = rooms.filter(
    (r: any) =>
      r.status !== "deleted" &&
      (type === "all" || r.type === type) &&
      r.name.toLowerCase().includes(search.toLowerCase())
  );

  // Check if current filter dates (or today if no dates selected) overlap an active resort block
  const effectiveCheckIn = checkIn || todayStr;
  const effectiveCheckOut = checkOut || effectiveCheckIn;

  const activeResortBlock = useMemo(() => {
    if (!blocks || blocks.length === 0) return null;
    return blocks.find((b: any) => {
      if (effectiveCheckIn === effectiveCheckOut) {
        return effectiveCheckIn >= b.start_date && effectiveCheckIn <= b.end_date;
      }
      return effectiveCheckIn <= b.end_date && effectiveCheckOut >= b.start_date;
    });
  }, [blocks, effectiveCheckIn, effectiveCheckOut]);

  // Determine overall status for a room based on maintenance AND resort-wide block
  const getRoomAvailability = (room: any) => {
    if (activeResortBlock) {
      return {
        status: "blocked",
        color: "red",
        text: "UNAVAILABLE",
        block: activeResortBlock,
        reason: activeResortBlock.reason || "The resort is temporarily unavailable for the selected dates.",
      };
    }

    if (room.status === "maintenance" || !room.is_available) {
      return { status: "maintenance", color: "gray", text: "Under Maintenance" };
    }

    return { status: "available", color: "green", text: "Available" };
  };

  const getBadgeClass = (color: string) => {
    switch (color) {
      case "green":
        return "bg-emerald-600 hover:bg-emerald-700 text-white font-bold";
      case "red":
        return "bg-red-600 hover:bg-red-700 text-white font-bold animate-pulse";
      case "yellow":
        return "bg-amber-500 hover:bg-amber-600 text-white font-bold";
      case "gray":
        return "bg-slate-500 hover:bg-slate-600 text-white font-medium";
      default:
        return "";
    }
  };

  const handleBookClick = (roomId: string, availability: ReturnType<typeof getRoomAvailability>) => {
    if (availability.status === "blocked") {
      setSelectedBlock(availability.block);
      setBlockedModalOpen(true);
      return;
    }
    if (availability.status === "maintenance") {
      return;
    }

    // Navigate to book page with preselected dates if specified
    const searchObj: Record<string, string> = {};
    if (checkIn) searchObj.check_in = checkIn;
    if (checkOut) searchObj.check_out = checkOut;

    navigate({
      to: "/book/$roomId",
      params: { roomId },
      search: searchObj,
    });
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <section className="bg-[image:var(--gradient-hero)] py-12 sm:py-16 text-white">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Rooms & Cottages</h1>
          <p className="mt-2 text-sm sm:text-base text-white/90">Choose your tropical sanctuary</p>
        </div>
      </section>

      <section className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {/* RESORT BLOCK ACTIVE BANNER */}
        {activeResortBlock && (
          <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-red-50 dark:bg-red-950/40 border-2 border-red-300 dark:border-red-800 text-red-950 dark:text-red-100 shadow-md flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300 shrink-0 mt-0.5 sm:mt-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-base sm:text-lg text-red-700 dark:text-red-300 uppercase tracking-tight">
                    Resort Temporarily Unavailable
                  </h3>
                  <Badge variant="destructive" className="font-bold text-[10px] uppercase">
                    All Accommodations Blocked
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-red-800 dark:text-red-200 mt-1">
                  The resort is currently unavailable for reservations from{" "}
                  <strong>{formatBlockDateRange(activeResortBlock.start_date, activeResortBlock.end_date)}</strong>
                  {activeResortBlock.reason ? (
                    <> (Reason: <strong>{activeResortBlock.reason}</strong>)</>
                  ) : null}
                  . All rooms, cottages, and function halls cannot be booked for these dates.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedBlock(activeResortBlock);
                setBlockedModalOpen(true);
              }}
              className="border-red-300 dark:border-red-700 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950 text-red-700 dark:text-red-300 font-bold shrink-0 self-end sm:self-center"
            >
              View Notice Details
            </Button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mb-6 sm:mb-8 rounded-xl border bg-card p-4 sm:p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search by Name */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Accommodation Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search rooms, cottages..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
            </div>

            {/* Room Type */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Category
              </label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="room">Rooms</SelectItem>
                  <SelectItem value="cottage">Cottages</SelectItem>
                  <SelectItem value="villa">Function Halls</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Check-In Date */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Check-in Date
              </label>
              <Input
                type="date"
                min={todayStr}
                value={checkIn}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  if (checkOut && e.target.value > checkOut) {
                    setCheckOut(e.target.value);
                  }
                }}
                className="h-10 text-xs"
              />
            </div>

            {/* Check-Out Date */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Check-out Date
                </label>
                {(checkIn || checkOut) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCheckIn("");
                      setCheckOut("");
                    }}
                    className="text-[11px] text-muted-foreground hover:text-slate-900 dark:hover:text-white flex items-center gap-0.5"
                  >
                    <X className="w-3 h-3" /> Clear dates
                  </button>
                )}
              </div>
              <Input
                type="date"
                min={checkIn || todayStr}
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs sm:text-sm">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <Info className="h-4 w-4" /> Legend:
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-emerald-600"></div> Available
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-600"></div> Unavailable / Resort Blocked
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-slate-500"></div> Maintenance
            </span>
          </div>
        </div>

        {roomsLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading accommodations…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No accommodations match your filters.</p>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r: any) => {
              const availability = getRoomAvailability(r);
              const isBlocked = availability.status === "blocked";
              const isMaintenance = availability.status === "maintenance";

              return (
                <Card
                  key={r.id}
                  className={`group overflow-hidden border-border/60 transition-all hover:shadow-md flex flex-col rounded-xl ${
                    isBlocked ? "border-red-300 dark:border-red-900/60 bg-red-50/10" : ""
                  }`}
                >
                  <div className="aspect-[4/3] overflow-hidden bg-muted relative">
                    {r.image_url && (
                      <img
                        src={r.image_url}
                        alt={r.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute top-3 right-3">
                      <Badge
                        variant="secondary"
                        className={`px-2.5 py-1 text-xs shadow-sm ${getBadgeClass(availability.color)}`}
                      >
                        {availability.text}
                      </Badge>
                    </div>

                    {isBlocked && (
                      <div className="absolute inset-0 bg-red-950/25 backdrop-blur-[1px] flex items-center justify-center p-4">
                        <span className="bg-red-600/95 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg shadow-md uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5" /> Resort Closed
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 sm:p-5 flex-1 flex flex-col">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{r.name}</h3>
                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground line-clamp-2">
                      {r.description}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs sm:text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" /> {r.capacity} guests
                      </span>
                      <span className="capitalize">· {r.type === "villa" ? "function hall" : r.type}</span>
                    </div>
                    <div className="mt-auto pt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl sm:text-2xl font-bold text-primary">
                            ₱{Number(r.price).toLocaleString()}
                          </span>
                          <span className="text-xs sm:text-sm text-muted-foreground font-medium">
                            {r.rate_type === "day" ? " / day" : " / night"}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            r.rate_type === "day"
                              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60"
                              : "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700/60"
                          }`}>
                            {r.rate_type === "day" ? "Day Rate" : "Nightly Rate"}
                          </span>
                        </div>
                      </div>

                      {isBlocked ? (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => handleBookClick(r.id, availability)}
                          className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white h-10 font-bold shadow-sm justify-center cursor-pointer"
                        >
                          Unavailable (Blocked)
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          disabled={isMaintenance}
                          onClick={() => handleBookClick(r.id, availability)}
                          className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 h-10 font-semibold shadow-sm justify-center cursor-pointer"
                        >
                          Book Now
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* POPUP ALERT WITH ACTUAL BLOCK REASON & DATES */}
      <ResortBlockedModal
        isOpen={blockedModalOpen}
        onClose={() => setBlockedModalOpen(false)}
        reason={selectedBlock?.reason}
        startDate={selectedBlock?.start_date}
        endDate={selectedBlock?.end_date}
        onChooseAnotherDate={() => {
          setBlockedModalOpen(false);
          setCheckIn("");
          setCheckOut("");
        }}
      />

      <Footer />
    </div>
  );
}
