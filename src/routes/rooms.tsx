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
import { supabase } from "@/integrations/supabase/client";
import { Users, Search, Info } from "lucide-react";

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

  const { data, isLoading } = useQuery({
    queryKey: ["rooms-and-bookings"],
    queryFn: async () => {
      const { data: roomsData, error } = await supabase
        .from("rooms")
        .select("*")
        .order("price");
      if (error) throw error;
      return { rooms: roomsData || [] };
    },
  });

  const rooms = data?.rooms || [];

  const filtered = rooms.filter(
    (r: any) =>
      r.status !== "deleted" &&
      (type === "all" || r.type === type) &&
      r.name.toLowerCase().includes(search.toLowerCase()),
  );

  const getRoomStatus = (room: any) => {
    if (room.status === "maintenance" || !room.is_available) {
      return { status: "maintenance", color: "gray", text: "Under Maintenance" };
    }
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
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Room Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by accommodation name..."
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
                        disabled={status.status === "maintenance"}
                        className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 h-10 font-semibold shadow-sm justify-center"
                      >
                        <Link
                          to="/book/$roomId"
                          params={{ roomId: r.id }}
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
