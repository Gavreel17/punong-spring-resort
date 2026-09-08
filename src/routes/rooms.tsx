import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResortCalendar } from "@/components/ResortCalendar";
import { supabase } from "@/integrations/supabase/client";
import { Users, Search, CalendarIcon, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date } | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ["rooms-and-bookings"],
    queryFn: async () => {
      const [roomsRes, bookingsRes] = await Promise.all([
        supabase.from("rooms").select("*").order("price"),
        supabase.from("bookings").select("*"),
      ]);
      return { rooms: roomsRes.data || [], bookings: bookingsRes.data || [] };
    },
  });

  const rooms = data?.rooms || [];
  const bookings = data?.bookings || [];

  const filtered = rooms.filter(
    (r: any) =>
      (type === "all" || r.type === type) && r.name.toLowerCase().includes(search.toLowerCase()),
  );

  const getRoomStatus = (room: any) => {
    if (!dateRange?.from || !dateRange?.to)
      return { status: "default", color: "green", text: room.is_available ? "Available" : "Full" };

    // Convert to UTC dates for string comparison
    const offset = dateRange.from.getTimezoneOffset() * 60000;
    const startStr = new Date(dateRange.from.getTime() - offset).toISOString().split("T")[0];
    const endStr = new Date(dateRange.to.getTime() - offset).toISOString().split("T")[0];

    if (startStr >= endStr) return { status: "invalid", color: "gray", text: "Invalid Dates" };

    // Check maintenance
    if (room.maintenance_start && room.maintenance_end) {
      if (startStr < room.maintenance_end && endStr > room.maintenance_start) {
        return { status: "maintenance", color: "gray", text: "Under Maintenance" };
      }
    }

    // Check bookings
    const overlapping = bookings.filter(
      (b: any) =>
        b.room_id === room.id &&
        b.status !== "rejected" &&
        b.status !== "cancelled" &&
        b.status !== "completed",
    );
    let hasPending = false;

    for (const b of overlapping) {
      if (startStr < b.check_out && endStr > b.check_in) {
        if (b.status === "approved") {
          return { status: "booked", color: "red", text: "Not Available" };
        }
        if (b.status === "pending") {
          hasPending = true;
        }
      }
    }

    if (hasPending) return { status: "pending", color: "yellow", text: "Reserved" };
    return { status: "available", color: "green", text: "Available" };
  };

  const getBadgeClass = (color: string) => {
    switch (color) {
      case "green":
        return "bg-green-500 hover:bg-green-600 text-white";
      case "red":
        return "bg-red-500 hover:bg-red-600 text-white";
      case "yellow":
        return "bg-yellow-400 hover:bg-yellow-500 text-white";
      case "gray":
        return "bg-slate-500 hover:bg-slate-600 text-white";
      default:
        return "";
    }
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
        <div className="mb-6 sm:mb-8 rounded-xl border bg-card p-4 sm:p-6 shadow-sm">
          <h2 className="mb-4 text-base sm:text-lg font-semibold flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-accent" /> Global Availability Search
          </h2>

          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Select Dates
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal h-10 truncate",
                      !dateRange && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <span className="truncate">
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </span>
                      ) : (
                        <span>{format(dateRange.from, "LLL dd, y")}</span>
                      )
                    ) : (
                      <span className="truncate">Pick your check-in & check-out dates</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] sm:w-auto p-0 max-w-sm overflow-x-auto" align="start">
                  <ResortCalendar
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={1}
                    className="border-0 shadow-none"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Room Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Room Type
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
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs sm:text-sm">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <Info className="h-4 w-4" /> Legend:
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-green-500"></div> Available
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-yellow-400"></div> Limited
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500"></div> Not Available
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-slate-500"></div> Maintenance
            </span>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading rooms…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No rooms match your filters.</p>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r: any) => {
              const status = getRoomStatus(r);

              return (
                <Card
                  key={r.id}
                  className="group overflow-hidden border-border/60 transition-all hover:shadow-md flex flex-col rounded-xl"
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
                        className={`px-2.5 py-1 text-xs font-medium shadow-sm ${getBadgeClass(status.color)}`}
                      >
                        {status.text}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-4 sm:p-5 flex-1 flex flex-col">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900">{r.name}</h3>
                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground line-clamp-2">
                      {r.description}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs sm:text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" /> {r.capacity} guests
                      </span>
                      <span className="capitalize">· {r.type === 'villa' ? 'function hall' : r.type}</span>
                    </div>
                    <div className="mt-auto pt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-t border-slate-100">
                      <div>
                        <span className="text-xl sm:text-2xl font-bold text-primary">
                          ₱{Number(r.price).toLocaleString()}
                        </span>
                        <span className="text-xs sm:text-sm text-muted-foreground"> / night</span>
                      </div>
                      <Button
                        asChild
                        disabled={
                          status.status === "booked" ||
                          status.status === "maintenance" ||
                          status.status === "invalid"
                        }
                        className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 h-10 font-semibold shadow-sm justify-center"
                      >
                        <Link
                          to="/book/$roomId"
                          params={{ roomId: r.id }}
                          search={{
                            check_in: dateRange?.from
                              ? new Date(
                                  dateRange.from.getTime() -
                                    dateRange.from.getTimezoneOffset() * 60000,
                                )
                                  .toISOString()
                                  .split("T")[0]
                              : undefined,
                            check_out: dateRange?.to
                              ? new Date(
                                  dateRange.to.getTime() - dateRange.to.getTimezoneOffset() * 60000,
                                )
                                  .toISOString()
                                  .split("T")[0]
                              : undefined,
                          }}
                        >
                          Book Now
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
}
