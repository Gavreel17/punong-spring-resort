import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarCheck,
  CalendarPlus,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Clock,
  User,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Wrench,
  ShieldAlert,
  DollarSign,
  BedDouble,
  ArrowRight,
  ArrowLeft,
  Check,
  RotateCcw,
  Sparkles,
  Eye,
  Users,
  Trash2,
  Building2,
  ExternalLink,
} from "lucide-react";
import { processAutoBookingStatuses } from "@/lib/booking-utils";
import { cn } from "@/lib/utils";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/calendar")({
  component: AvailabilityCalendarTab,
});

export function AvailabilityCalendarTab() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Date Navigation State
  const [currentMonth, setCurrentMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [viewMode, setViewMode] = useState<"matrix" | "month" | "agenda">("matrix");
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [dayAgendaModalDate, setDayAgendaModalDate] = useState<string | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({ start_date: "", end_date: "", reason: "" });

  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    room_id: "",
    start_date: "",
    end_date: "",
    notes: "",
  });

  const [newBookingModalOpen, setNewBookingModalOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    room_id: "",
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    check_in: "",
    check_out: "",
    guests: 1,
    total_amount: 0,
    payment_status: "unpaid" as "unpaid" | "verified" | "pending",
    payment_method: "cash" as "cash" | "gcash" | "bank_transfer",
    special_requests: "",
  });
  const [creatingBooking, setCreatingBooking] = useState(false);

  // Cell click action picker modal
  const [cellActionData, setCellActionData] = useState<{
    room: any;
    dateStr: string;
  } | null>(null);

  // Main Calendar Data Query
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin-availability-calendar"],
    queryFn: async () => {
      const [roomsRes, bookingsRes, blocksRes] = await Promise.all([
        supabase.from("rooms").select("*").order("name"),
        supabase
          .from("bookings")
          .select(
            "*, room:rooms(name, type, price), profile:profiles!bookings_user_id_fkey(fullname,email), payments(*)"
          )
          .is("deleted_at", null)
          .order("check_in", { ascending: true }),
        (async () => {
          try {
            const { data } = await supabase.from("resort_blocks" as any).select("*");
            return { data: data || [] };
          } catch (e) {
            console.error("Failed to fetch resort blocks:", e);
            return { data: [] };
          }
        })(),
      ]);

      const fetchedBookings = bookingsRes.data || [];
      await processAutoBookingStatuses(fetchedBookings);

      return {
        rooms: roomsRes.data || [],
        bookings: fetchedBookings,
        blocks: blocksRes.data || [],
      };
    },
    refetchInterval: 15000,
  });

  const rooms = data?.rooms || [];
  const bookings = data?.bookings || [];
  const blocks = (data?.blocks || []) as any[];

  // Month navigation helpers
  const nextMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const jumpToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedAgendaDate(today.toISOString().split("T")[0]);
  };

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Filtered rooms list
  const filteredRooms = useMemo(() => {
    return rooms.filter((r: any) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesRoom = r.name.toLowerCase().includes(term);
        // Also check if any booking for this room matches search term
        const hasMatchingBooking = bookings.some(
          (b: any) =>
            b.room_id === r.id &&
            (b.guest_name?.toLowerCase().includes(term) ||
              b.guest_email?.toLowerCase().includes(term) ||
              b.guest_phone?.includes(term))
        );
        if (!matchesRoom && !hasMatchingBooking) return false;
      }
      return true;
    });
  }, [rooms, typeFilter, searchTerm, bookings]);

  // Unique room types
  const roomTypes = useMemo(() => {
    const types = new Set<string>();
    rooms.forEach((r: any) => {
      if (r.type) types.add(r.type);
    });
    return Array.from(types);
  }, [rooms]);

  // Status Cell Calculator
  const getCellData = (room: any, day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // 1. Resort blocked override check
    for (const block of blocks) {
      if (dateStr >= block.start_date && dateStr <= block.end_date) {
        return {
          color: "bg-rose-950 text-rose-200 border border-rose-800",
          type: "blocked",
          text: "Blocked",
          reason: block.reason || "Resort Blocked",
          dateStr,
        };
      }
    }

    // 2. Specific room maintenance check
    if (room.status === "maintenance" || (room.maintenance_start && room.maintenance_end)) {
      if (
        !room.maintenance_start ||
        (dateStr >= room.maintenance_start && dateStr <= room.maintenance_end)
      ) {
        return {
          color: "bg-slate-700 text-slate-200 border border-slate-600",
          type: "maintenance",
          text: "Maint",
          dateStr,
        };
      }
    }

    // 3. Bookings check
    const dailyBookings = bookings.filter(
      (b: any) =>
        b.room_id === room.id &&
        b.status !== "rejected" &&
        b.status !== "cancelled" &&
        b.status !== "completed"
    );

    for (const b of dailyBookings) {
      if (dateStr >= b.check_in && dateStr < b.check_out) {
        const isCheckInDay = dateStr === b.check_in;
        const guestFirst = b.guest_name ? b.guest_name.split(" ")[0] : "Guest";

        if (b.status === "approved") {
          return {
            color: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
            type: "booking",
            booking: b,
            text: isCheckInDay ? `→ ${guestFirst}` : guestFirst,
            dateStr,
          };
        }
        if (b.status === "pending") {
          return {
            color: "bg-amber-500 text-white hover:bg-amber-600 shadow-sm",
            type: "booking",
            booking: b,
            text: isCheckInDay ? `⏳ ${guestFirst}` : guestFirst,
            dateStr,
          };
        }
      }
    }

    // Check completed booking just to visualize past stays
    const completedBooking = bookings.find(
      (b: any) =>
        b.room_id === room.id &&
        b.status === "completed" &&
        dateStr >= b.check_in &&
        dateStr < b.check_out
    );
    if (completedBooking) {
      return {
        color: "bg-blue-600/70 text-white hover:bg-blue-700",
        type: "booking",
        booking: completedBooking,
        text: "Done",
        dateStr,
      };
    }

    return {
      color: "bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 border border-dashed border-slate-200 hover:border-emerald-300",
      type: "free",
      text: "+",
      dateStr,
    };
  };

  // Global availability per day
  const getGlobalCellData = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    for (const block of blocks) {
      if (dateStr >= block.start_date && dateStr <= block.end_date) {
        return {
          color: "bg-rose-950 border-rose-900 text-white font-bold",
          tooltip: "Resort Override Blocked",
          icon: "X",
          occupied: rooms.length,
          avail: 0,
        };
      }
    }

    if (rooms.length === 0) {
      return { color: "bg-muted text-slate-500", tooltip: "No rooms available", icon: "-", occupied: 0, avail: 0 };
    }

    let occupied = 0;
    rooms.forEach((r: any) => {
      const cell = getCellData(r, day);
      if (cell.type === "maintenance" || cell.type === "booking") occupied++;
    });

    const avail = rooms.length - occupied;
    if (avail === 0) {
      return {
        color: "bg-rose-600 text-white font-bold border-rose-700",
        tooltip: "Fully Booked (0 left)",
        icon: "Full",
        occupied,
        avail,
      };
    }
    if (avail <= 2) {
      return {
        color: "bg-amber-500 text-white font-bold border-amber-600",
        tooltip: `Limited Availability (${avail} left)`,
        icon: `${avail}`,
        occupied,
        avail,
      };
    }
    return {
      color: "bg-emerald-600 text-white font-bold border-emerald-700",
      tooltip: `${avail} Available`,
      icon: `${avail}`,
      occupied,
      avail,
    };
  };

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalRoomsCount = rooms.length;

    // Check today's occupancy
    let todayOccupied = 0;
    rooms.forEach((r: any) => {
      const isMaint =
        r.status === "maintenance" ||
        (r.maintenance_start &&
          r.maintenance_end &&
          todayStr >= r.maintenance_start &&
          todayStr <= r.maintenance_end);
      const isBooked = bookings.some(
        (b: any) =>
          b.room_id === r.id &&
          b.status === "approved" &&
          todayStr >= b.check_in &&
          todayStr < b.check_out
      );
      if (isMaint || isBooked) todayOccupied++;
    });

    const todayCheckIns = bookings.filter(
      (b: any) => b.check_in === todayStr && (b.status === "approved" || b.status === "pending")
    ).length;

    const todayCheckOuts = bookings.filter(
      (b: any) => b.check_out === todayStr && (b.status === "approved" || b.status === "completed")
    ).length;

    const activeMonthBookings = bookings.filter((b: any) => {
      const monthStart = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-01`;
      const monthEnd = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      return (
        b.status !== "rejected" &&
        b.status !== "cancelled" &&
        b.check_in <= monthEnd &&
        b.check_out >= monthStart
      );
    }).length;

    const occupancyRate =
      totalRoomsCount > 0 ? Math.round((todayOccupied / totalRoomsCount) * 100) : 0;

    return {
      totalRoomsCount,
      todayOccupied,
      occupancyRate,
      todayCheckIns,
      todayCheckOuts,
      activeMonthBookings,
    };
  }, [rooms, bookings, todayStr, currentMonth, daysInMonth]);

  // Open New Walk-in / Direct Reservation modal
  const openNewBookingModal = (defaultRoomId?: string, defaultCheckIn?: string) => {
    const checkInDate = defaultCheckIn || todayStr;
    const nextDay = new Date(new Date(checkInDate).getTime() + 86400000)
      .toISOString()
      .split("T")[0];

    const selectedRoom = rooms.find((r: any) => r.id === defaultRoomId) || rooms[0];
    const initialPrice = selectedRoom ? Number(selectedRoom.price) : 0;

    setBookingForm({
      room_id: selectedRoom?.id || "",
      guest_name: "",
      guest_email: "",
      guest_phone: "",
      check_in: checkInDate,
      check_out: nextDay,
      guests: 2,
      total_amount: initialPrice,
      payment_status: "verified",
      payment_method: "cash",
      special_requests: "Direct Walk-in / Admin Reservation",
    });
    setNewBookingModalOpen(true);
  };

  // Recalculate price when room or dates change in booking form
  const handleBookingFormChange = (updates: Partial<typeof bookingForm>) => {
    const next = { ...bookingForm, ...updates };

    if (updates.room_id || updates.check_in || updates.check_out) {
      const room = rooms.find((r: any) => r.id === next.room_id);
      if (room && next.check_in && next.check_out) {
        const d1 = new Date(next.check_in);
        const d2 = new Date(next.check_out);
        const diffDays = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
        next.total_amount = Number(room.price) * diffDays;
      }
    }

    setBookingForm(next);
  };

  // Submit direct reservation
  const handleCreateBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingForm.room_id) return toast.error("Please select an accommodation");
    if (!bookingForm.guest_name.trim()) return toast.error("Guest name is required");
    if (!bookingForm.check_in || !bookingForm.check_out)
      return toast.error("Check-in and Check-out dates are required");
    if (bookingForm.check_out <= bookingForm.check_in)
      return toast.error("Check-out date must be after Check-in date");

    // Double-booking check
    const conflict = bookings.find((b: any) => {
      if (b.room_id !== bookingForm.room_id) return false;
      if (b.status === "rejected" || b.status === "cancelled") return false;
      return bookingForm.check_in < b.check_out && bookingForm.check_out > b.check_in;
    });

    if (conflict) {
      const confirmOverride = await MySwal.fire({
        title: "Schedule Conflict Detected!",
        text: `This accommodation is already reserved by ${conflict.guest_name} from ${conflict.check_in} to ${conflict.check_out}. Do you still want to proceed?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#f59e0b",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Force Booking",
      });
      if (!confirmOverride.isConfirmed) return;
    }

    setCreatingBooking(true);
    try {
      const targetRoom = rooms.find((r: any) => r.id === bookingForm.room_id);
      const { data: newBooking, error: bErr } = await supabase
        .from("bookings")
        .insert({
          user_id: user?.id || "00000000-0000-0000-0000-000000000000",
          room_id: bookingForm.room_id,
          guest_name: bookingForm.guest_name.trim(),
          guest_email: bookingForm.guest_email.trim() || "walkin@punongresort.com",
          guest_phone: bookingForm.guest_phone.trim() || "N/A",
          check_in: bookingForm.check_in,
          check_out: bookingForm.check_out,
          guests: Number(bookingForm.guests) || 1,
          total_amount: Number(bookingForm.total_amount) || 0,
          status: "approved",
          special_requests: bookingForm.special_requests || "Direct Walk-in Reservation",
        })
        .select("*, room:rooms(name, type)")
        .single();

      if (bErr) throw bErr;

      // Create associated payment record
      if (newBooking) {
        await supabase.from("payments").insert({
          booking_id: newBooking.id,
          user_id: user?.id || "00000000-0000-0000-0000-000000000000",
          amount:
            bookingForm.payment_status === "verified"
              ? Number(bookingForm.total_amount)
              : 0,
          status: bookingForm.payment_status,
          notes: JSON.stringify({
            method: bookingForm.payment_method,
            type: "direct_walk_in",
            created_by: user?.email || "Admin",
          }),
        });

        // Trigger transactional email if customer email exists
        if (bookingForm.guest_email && bookingForm.guest_email.includes("@")) {
          supabase.functions
            .invoke("booking-emails", {
              body: { emailType: "status_update", bookingData: newBooking },
            })
            .catch((err: unknown) => console.warn("Email alert notice:", err));
        }
      }

      toast.success("Reservation confirmed and added to calendar!");
      setNewBookingModalOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["global-availability"] });
    } catch (err: any) {
      console.error("Booking error:", err);
      toast.error(err.message || "Failed to create reservation");
    } finally {
      setCreatingBooking(false);
    }
  };

  // Schedule Room Maintenance
  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceForm.room_id) return toast.error("Please select a room");
    if (!maintenanceForm.start_date || !maintenanceForm.end_date)
      return toast.error("Start and end dates are required");

    const { error } = await supabase
      .from("rooms")
      .update({
        status: "maintenance",
        maintenance_start: maintenanceForm.start_date,
        maintenance_end: maintenanceForm.end_date,
      })
      .eq("id", maintenanceForm.room_id);

    if (error) return toast.error(error.message);

    toast.success("Room set to maintenance schedule");
    setMaintenanceModalOpen(false);
    refetch();
    qc.invalidateQueries({ queryKey: ["global-availability"] });
  };

  // Clear Room Maintenance
  const clearRoomMaintenance = async (roomId: string) => {
    const { error } = await supabase
      .from("rooms")
      .update({
        status: "available",
        maintenance_start: null,
        maintenance_end: null,
      })
      .eq("id", roomId);

    if (error) return toast.error(error.message);
    toast.success("Room restored to available");
    refetch();
    qc.invalidateQueries({ queryKey: ["global-availability"] });
  };

  // Submit Resort Block
  const handleBlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("resort_blocks" as any).insert({
      start_date: blockForm.start_date,
      end_date: blockForm.end_date,
      reason: blockForm.reason || "Administrative Closure",
    });
    if (error) return toast.error("Failed to block dates");
    toast.success("Resort blocked for selected dates");
    setBlockModalOpen(false);
    setBlockForm({ start_date: "", end_date: "", reason: "" });
    refetch();
    qc.invalidateQueries({ queryKey: ["global-availability"] });
  };

  // Update Booking Status from Quick View
  const handleUpdateBookingStatus = async (
    bookingId: string,
    newStatus: "approved" | "rejected" | "completed" | "no-show" | "cancelled"
  ) => {
    const confirm = await MySwal.fire({
      title: `Confirm ${newStatus.toUpperCase()}?`,
      text: `Are you sure you want to mark this reservation as ${newStatus}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: newStatus === "approved" || newStatus === "completed" ? "#059669" : "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: `Yes, mark ${newStatus}`,
    });

    if (!confirm.isConfirmed) return;

    const { data: updatedBooking, error } = await supabase
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", bookingId)
      .select("*, room:rooms(name, type)")
      .single();

    if (error) return toast.error(error.message);

    // Send email alert
    if (updatedBooking) {
      supabase.functions
        .invoke("booking-emails", {
          body: { emailType: "status_update", bookingData: updatedBooking },
        })
        .catch((err: unknown) => console.warn("Email notice:", err));
    }

    toast.success(`Booking status changed to ${newStatus}`);
    setSelectedBooking(null);
    refetch();
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["global-availability"] });
  };

  // Toggle payment status from quick view
  const handleTogglePaymentVerified = async (bookingId: string, currentStatus: string) => {
    const targetStatus = currentStatus === "verified" ? "unpaid" : "verified";
    const payment = selectedBooking?.payments?.[0];

    if (payment) {
      await supabase.from("payments").update({ status: targetStatus }).eq("id", payment.id);
    } else {
      await supabase.from("payments").insert({
        booking_id: bookingId,
        user_id: user?.id || "00000000-0000-0000-0000-000000000000",
        amount: Number(selectedBooking.total_amount),
        status: targetStatus,
        notes: JSON.stringify({ method: "resort" }),
      });
    }

    toast.success(`Payment updated to ${targetStatus}`);
    setSelectedBooking((prev: any) => ({
      ...prev,
      payments: [{ ...(prev?.payments?.[0] || {}), status: targetStatus }],
    }));
    refetch();
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
  };

  // Agenda Data for a Given Date
  const getAgendaForDate = (dateStr: string) => {
    const checkIns = bookings.filter(
      (b: any) => b.check_in === dateStr && b.status !== "rejected" && b.status !== "cancelled"
    );
    const checkOuts = bookings.filter(
      (b: any) => b.check_out === dateStr && b.status !== "rejected" && b.status !== "cancelled"
    );
    const stays = bookings.filter(
      (b: any) =>
        dateStr > b.check_in &&
        dateStr < b.check_out &&
        b.status !== "rejected" &&
        b.status !== "cancelled"
    );

    const occupiedRoomIds = new Set([
      ...checkIns.map((b: any) => b.room_id),
      ...stays.map((b: any) => b.room_id),
    ]);

    const vacantRooms = rooms.filter((r: any) => !occupiedRoomIds.has(r.id));
    const maintenanceRooms = rooms.filter(
      (r: any) =>
        r.status === "maintenance" ||
        (r.maintenance_start &&
          r.maintenance_end &&
          dateStr >= r.maintenance_start &&
          dateStr <= r.maintenance_end)
    );

    return { checkIns, checkOuts, stays, vacantRooms, maintenanceRooms };
  };

  // Generate days for standard Month view grid
  const monthCalendarWeeks = useMemo(() => {
    const firstDayIndex = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1
    ).getDay(); // 0 = Sun
    const totalDays = daysInMonth;

    const matrix: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    // Leading blanks
    for (let i = 0; i < firstDayIndex; i++) {
      currentWeek.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        matrix.push(currentWeek);
        currentWeek = [];
      }
    }

    // Trailing blanks
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      matrix.push(currentWeek);
    }

    return matrix;
  }, [currentMonth, daysInMonth]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 1. Header & Live Stats Overview */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[11px] uppercase tracking-wider border border-[#D4AF37]/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Resort Calendar Suite
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Live Room Occupancy & Operational Control
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display tracking-tight mt-1 flex items-center gap-3">
            {currentMonth.toLocaleString("default", { month: "long", year: "numeric" })}
          </h1>
        </div>

        {/* View Switcher & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Navigation Controls */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <Button
              size="sm"
              variant="ghost"
              onClick={prevMonth}
              className="h-8 px-2.5 text-xs font-bold text-slate-700 hover:bg-white rounded-lg transition-all"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={jumpToToday}
              className="h-8 px-3 text-xs font-bold text-slate-900 hover:bg-white rounded-lg transition-all"
            >
              Today
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={nextMonth}
              className="h-8 px-2.5 text-xs font-bold text-slate-700 hover:bg-white rounded-lg transition-all"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* View Modes */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode("matrix")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === "matrix"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Room Matrix
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === "month"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Month View
            </button>
            <button
              onClick={() => setViewMode("agenda")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === "agenda"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Day Agenda
            </button>
          </div>

          {/* Action CTAs */}
          <Button
            onClick={() => openNewBookingModal()}
            size="sm"
            className="h-9 px-3.5 rounded-xl font-bold bg-[#B38728] hover:bg-[#9a721e] text-white shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Direct Booking
          </Button>

          <Button
            onClick={() => setMaintenanceModalOpen(true)}
            size="sm"
            variant="outline"
            className="h-9 px-3 rounded-xl font-bold border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Wrench className="w-3.5 h-3.5 text-slate-500" /> Maintenance
          </Button>

          <Button
            onClick={() => setBlockModalOpen(true)}
            variant="destructive"
            size="sm"
            className="h-9 px-3.5 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Block Resort
          </Button>
        </div>
      </div>

      {/* 2. Occupancy Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <BedDouble className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Accommodations
            </div>
            <div className="text-lg font-extrabold text-slate-900">
              {summaryMetrics.totalRoomsCount} Units
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Today's Occupancy
            </div>
            <div className="text-lg font-extrabold text-slate-900">
              {summaryMetrics.todayOccupied} / {summaryMetrics.totalRoomsCount}{" "}
              <span className="text-xs font-semibold text-amber-600">
                ({summaryMetrics.occupancyRate}%)
              </span>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
            <ArrowRight className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Arrivals Today
            </div>
            <div className="text-lg font-extrabold text-slate-900">
              {summaryMetrics.todayCheckIns} Check-in(s)
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
            <ArrowLeft className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Departures Today
            </div>
            <div className="text-lg font-extrabold text-slate-900">
              {summaryMetrics.todayCheckOuts} Check-out(s)
            </div>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Month Reservations
            </div>
            <div className="text-lg font-extrabold text-slate-900">
              {summaryMetrics.activeMonthBookings} Stays
            </div>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Toolbars */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[220px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search guest or room..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs rounded-lg bg-white border-slate-300"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-xs rounded-lg bg-white w-40 border-slate-300">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {roomTypes.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type === "villa" ? "Function Hall / Villa" : type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quick legend inline */}
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-600"></span> Confirmed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span> Pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-600"></span> Maintenance
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-950"></span> Blocked
          </span>
        </div>
      </div>

      {/* 4. MAIN CONTENT AREA BASED ON VIEW MODE */}

      {/* VIEW A: INTERACTIVE ROOM MATRIX */}
      {viewMode === "matrix" && (
        <div className="space-y-3">
          <div className="overflow-x-auto pb-4 rounded-2xl border border-slate-200/90 shadow-sm bg-white">
            <table className="w-full border-collapse min-w-[950px] text-sm select-none">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-xs">
                  <th className="p-3 text-left sticky left-0 z-30 bg-slate-100 backdrop-blur-md w-56 font-bold text-slate-700 uppercase tracking-wider border-r border-slate-200 shadow-sm">
                    Accommodation
                  </th>
                  {days.map((d) => {
                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const isToday = dateStr === todayStr;
                    return (
                      <th
                        key={d}
                        onClick={() => setDayAgendaModalDate(dateStr)}
                        className={cn(
                          "p-2 text-center w-10 min-w-10 font-bold border-r border-slate-200/60 cursor-pointer hover:bg-slate-200/80 transition-colors group",
                          isToday ? "bg-amber-100/90 text-amber-950 font-black ring-1 ring-amber-400" : "text-slate-700"
                        )}
                        title={`Click to view agenda for ${dateStr}`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] uppercase tracking-tighter opacity-60">
                            {new Date(dateStr).toLocaleDateString("en-US", { weekday: "narrow" })}
                          </span>
                          <span className="text-xs group-hover:scale-110 transition-transform">
                            {d}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>

                {/* Overall Occupancy Indicator Row */}
                <tr className="bg-amber-50/40 border-b border-slate-200 text-xs">
                  <td className="p-3 font-bold text-slate-800 uppercase tracking-wider sticky left-0 bg-amber-50/90 backdrop-blur-md z-30 border-r border-slate-200 shadow-sm">
                    Resort Capacity
                  </td>
                  {days.map((d) => {
                    const cell = getGlobalCellData(d);
                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    return (
                      <td
                        key={d}
                        className="p-1 border-r border-slate-200/40 text-center cursor-pointer"
                        title={`${dateStr}: ${cell.tooltip}`}
                        onClick={() => setDayAgendaModalDate(dateStr)}
                      >
                        <div
                          className={cn(
                            "w-full h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-105 shadow-2xs",
                            cell.color
                          )}
                        >
                          {cell.icon}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {filteredRooms.length === 0 ? (
                  <tr>
                    <td
                      colSpan={days.length + 1}
                      className="text-center py-12 text-slate-400 italic"
                    >
                      No accommodations found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredRooms.map((r: any) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors"
                    >
                      {/* Room Column */}
                      <td className="p-3 sticky left-0 bg-white z-20 border-r border-slate-200 shadow-sm">
                        <div className="flex flex-col">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                              {r.name}
                            </span>
                            {r.status === "maintenance" && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 border-amber-400 bg-amber-50 text-amber-800"
                              >
                                Maint
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            <span>{r.type === "villa" ? "Function Hall" : r.type || "ROOM"}</span>
                            <span>•</span>
                            <span>₱{Number(r.price).toLocaleString()}/night</span>
                          </div>
                        </div>
                      </td>

                      {/* Day Cells */}
                      {days.map((d) => {
                        const cell = getCellData(r, d);
                        const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                        const isToday = dateStr === todayStr;

                        return (
                          <td
                            key={d}
                            className={cn(
                              "p-1 border-r border-slate-100 transition-colors",
                              isToday && "bg-amber-50/30"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (cell.type === "booking") {
                                  setSelectedBooking(cell.booking);
                                } else if (cell.type === "maintenance") {
                                  setMaintenanceForm({
                                    room_id: r.id,
                                    start_date: r.maintenance_start || dateStr,
                                    end_date: r.maintenance_end || dateStr,
                                    notes: "",
                                  });
                                  setMaintenanceModalOpen(true);
                                } else if (cell.type === "blocked") {
                                  setBlockModalOpen(true);
                                } else {
                                  // Free cell: open action modal or directly book
                                  setCellActionData({ room: r, dateStr });
                                }
                              }}
                              className={cn(
                                "w-full h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all truncate px-1 cursor-pointer",
                                cell.color
                              )}
                              title={
                                cell.type === "booking"
                                  ? `${cell.booking?.guest_name} (${cell.booking?.check_in} to ${cell.booking?.check_out})`
                                  : cell.type === "maintenance"
                                  ? `Maintenance: ${r.name}`
                                  : cell.type === "blocked"
                                  ? `Blocked: ${cell.reason}`
                                  : `Available: Click to book ${r.name} on ${dateStr}`
                              }
                            >
                              {cell.text}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>💡 Tip: Click any day number to view the Day Agenda, or click any available cell to create a walk-in booking.</span>
            <span>Current Month: {currentMonth.toLocaleString("default", { month: "long", year: "numeric" })}</span>
          </div>
        </div>
      )}

      {/* VIEW B: FULL MONTH CALENDAR GRID */}
      {viewMode === "month" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            {/* Weekday Header */}
            <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-200 text-center font-bold text-xs uppercase tracking-wider text-slate-700 py-2.5">
              <div className="text-rose-600">Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div className="text-blue-600">Sat</div>
            </div>

            {/* Weeks Matrix */}
            <div className="divide-y divide-slate-200">
              {monthCalendarWeeks.map((week, wIdx) => (
                <div key={wIdx} className="grid grid-cols-7 divide-x divide-slate-100 min-h-[110px]">
                  {week.map((day, dIdx) => {
                    if (!day) {
                      return <div key={dIdx} className="bg-slate-50/50 p-2" />;
                    }

                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isToday = dateStr === todayStr;

                    // Bookings active on this day
                    const dayBookings = bookings.filter(
                      (b: any) =>
                        dateStr >= b.check_in &&
                        dateStr < b.check_out &&
                        b.status !== "rejected" &&
                        b.status !== "cancelled"
                    );

                    // Resort block
                    const isBlocked = blocks.some(
                      (b: any) => dateStr >= b.start_date && dateStr <= b.end_date
                    );

                    return (
                      <div
                        key={dIdx}
                        onClick={() => setDayAgendaModalDate(dateStr)}
                        className={cn(
                          "p-2 flex flex-col justify-between transition-colors hover:bg-slate-50/80 cursor-pointer group relative",
                          isToday && "bg-amber-50/50 ring-1 ring-amber-400 inset-0",
                          isBlocked && "bg-rose-50/40"
                        )}
                      >
                        {/* Day Number Header */}
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center",
                              isToday
                                ? "bg-amber-500 text-white shadow-sm"
                                : "text-slate-700 group-hover:text-slate-900"
                            )}
                          >
                            {day}
                          </span>

                          {isBlocked ? (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0 font-bold">
                              Blocked
                            </Badge>
                          ) : dayBookings.length > 0 ? (
                            <span className="text-[10px] font-bold text-slate-500">
                              {dayBookings.length} Booked
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              + Book
                            </span>
                          )}
                        </div>

                        {/* Booking Chips */}
                        <div className="space-y-1 my-1 flex-1 overflow-hidden">
                          {dayBookings.slice(0, 3).map((b: any) => (
                            <div
                              key={b.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBooking(b);
                              }}
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-bold truncate flex items-center justify-between text-white shadow-2xs hover:opacity-90 transition-opacity",
                                b.status === "approved"
                                  ? "bg-emerald-600"
                                  : b.status === "completed"
                                  ? "bg-blue-600"
                                  : "bg-amber-500"
                              )}
                              title={`${b.guest_name} - ${b.room?.name || "Room"}`}
                            >
                              <span className="truncate">{b.guest_name}</span>
                              <span className="text-[8px] opacity-80 uppercase ml-1">
                                {b.room?.name?.split(" ")[0]}
                              </span>
                            </div>
                          ))}

                          {dayBookings.length > 3 && (
                            <div className="text-[9px] font-bold text-slate-500 pl-1">
                              +{dayBookings.length - 3} more...
                            </div>
                          )}
                        </div>

                        {/* Bottom day occupancy indicator */}
                        <div className="text-[9px] text-slate-400 font-medium">
                          {rooms.length - dayBookings.length} free
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW C: DAILY OPERATIONAL AGENDA VIEW */}
      {viewMode === "agenda" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Select Operational Date:
              </Label>
              <Input
                type="date"
                value={selectedAgendaDate}
                onChange={(e) => setSelectedAgendaDate(e.target.value)}
                className="h-9 w-44 rounded-lg bg-white text-xs border-slate-300"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedAgendaDate(todayStr)}
                className="h-9 text-xs rounded-lg font-bold"
              >
                Today
              </Button>
            </div>

            <Button
              size="sm"
              onClick={() => openNewBookingModal(undefined, selectedAgendaDate)}
              className="h-9 font-bold rounded-xl bg-[#B38728] hover:bg-[#9a721e] text-white"
            >
              <Plus className="w-4 h-4 mr-1" /> New Booking on this Date
            </Button>
          </div>

          {/* Agenda breakdown cards */}
          {(() => {
            const agenda = getAgendaForDate(selectedAgendaDate);
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Check-ins Card */}
                <Card className="rounded-2xl border-slate-200 shadow-xs">
                  <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-emerald-600" /> Arrivals (Check-Ins)
                    </CardTitle>
                    <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold">
                      {agenda.checkIns.length} Guests
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {agenda.checkIns.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        No arrivals scheduled for this date.
                      </p>
                    ) : (
                      agenda.checkIns.map((b: any) => (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBooking(b)}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-emerald-50/50 hover:border-emerald-200 transition-all cursor-pointer space-y-1.5"
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-xs text-slate-900">{b.guest_name}</span>
                            <Badge variant="outline" className="text-[10px] capitalize font-bold">
                              {b.status}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center justify-between">
                            <span>{b.room?.name}</span>
                            <span className="font-bold text-[#B38728]">
                              ₱{Number(b.total_amount).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {b.guest_phone || b.guest_email}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* 2. Check-outs Card */}
                <Card className="rounded-2xl border-slate-200 shadow-xs">
                  <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <ArrowLeft className="w-4 h-4 text-blue-600" /> Departures (Check-Outs)
                    </CardTitle>
                    <Badge className="bg-blue-100 text-blue-800 border-none font-bold">
                      {agenda.checkOuts.length} Guests
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {agenda.checkOuts.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        No departures scheduled for this date.
                      </p>
                    ) : (
                      agenda.checkOuts.map((b: any) => (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBooking(b)}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-blue-50/50 hover:border-blue-200 transition-all cursor-pointer space-y-1.5"
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-xs text-slate-900">{b.guest_name}</span>
                            <Badge variant="outline" className="text-[10px] capitalize font-bold">
                              {b.status}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center justify-between">
                            <span>{b.room?.name}</span>
                            <span className="font-bold text-slate-700">
                              Stayed {b.check_in} to {b.check_out}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* 3. Available Rooms on this date */}
                <Card className="rounded-2xl border-slate-200 shadow-xs md:col-span-2 lg:col-span-1">
                  <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <BedDouble className="w-4 h-4 text-[#B38728]" /> Vacant Accommodations
                    </CardTitle>
                    <Badge className="bg-amber-100 text-amber-800 border-none font-bold">
                      {agenda.vacantRooms.length} Free
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2 max-h-[360px] overflow-y-auto">
                    {agenda.vacantRooms.length === 0 ? (
                      <p className="text-xs text-rose-500 font-bold py-4 text-center">
                        Fully Booked! No vacant rooms on this date.
                      </p>
                    ) : (
                      agenda.vacantRooms.map((r: any) => (
                        <div
                          key={r.id}
                          className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900">{r.name}</div>
                            <div className="text-[10px] text-slate-400">
                              ₱{Number(r.price).toLocaleString()} • Cap: {r.capacity || "2-4"}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => openNewBookingModal(r.id, selectedAgendaDate)}
                            className="h-7 px-2.5 text-[11px] font-bold rounded-lg bg-[#B38728] hover:bg-[#9a721e] text-white"
                          >
                            + Book
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </div>
      )}

      {/* 5. MODAL: DAY AGENDA MODAL (Triggered by clicking Day Column Header) */}
      <Dialog
        open={!!dayAgendaModalDate}
        onOpenChange={(open) => !open && setDayAgendaModalDate(null)}
      >
        <DialogContent className="rounded-2xl max-w-xl p-6 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-display flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#B38728]" /> Day Overview:{" "}
              {dayAgendaModalDate &&
                new Date(dayAgendaModalDate).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
            </DialogTitle>
          </DialogHeader>

          {dayAgendaModalDate && (() => {
            const agenda = getAgendaForDate(dayAgendaModalDate);
            return (
              <div className="space-y-5 py-2">
                {/* Check-ins */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-2 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" /> Check-Ins ({agenda.checkIns.length})
                  </h4>
                  {agenda.checkIns.length === 0 ? (
                    <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-xl">
                      No check-ins today.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {agenda.checkIns.map((b: any) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            setDayAgendaModalDate(null);
                            setSelectedBooking(b);
                          }}
                          className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 transition-colors cursor-pointer flex justify-between items-center"
                        >
                          <div>
                            <span className="font-bold text-xs text-slate-900 block">
                              {b.guest_name}
                            </span>
                            <span className="text-[11px] text-slate-600">
                              {b.room?.name} • Check-out: {b.check_out}
                            </span>
                          </div>
                          <Badge className="bg-emerald-600 text-white text-[10px]">
                            {b.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Check-outs */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800 mb-2 flex items-center gap-1.5">
                    <ArrowLeft className="w-3.5 h-3.5" /> Check-Outs ({agenda.checkOuts.length})
                  </h4>
                  {agenda.checkOuts.length === 0 ? (
                    <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-xl">
                      No check-outs today.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {agenda.checkOuts.map((b: any) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            setDayAgendaModalDate(null);
                            setSelectedBooking(b);
                          }}
                          className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/50 transition-colors cursor-pointer flex justify-between items-center"
                        >
                          <div>
                            <span className="font-bold text-xs text-slate-900 block">
                              {b.guest_name}
                            </span>
                            <span className="text-[11px] text-slate-600">
                              {b.room?.name} • Departed
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {b.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stays in house */}
                {agenda.stays.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      In-House Stays ({agenda.stays.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {agenda.stays.map((b: any) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            setDayAgendaModalDate(null);
                            setSelectedBooking(b);
                          }}
                          className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer text-xs"
                        >
                          <span className="font-bold text-slate-900 block">{b.guest_name}</span>
                          <span className="text-[11px] text-slate-500">
                            {b.room?.name} (until {b.check_out})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available rooms */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Available Accommodations ({agenda.vacantRooms.length})
                    </h4>
                    <Button
                      size="sm"
                      onClick={() => {
                        setDayAgendaModalDate(null);
                        openNewBookingModal(undefined, dayAgendaModalDate);
                      }}
                      className="h-7 text-xs font-bold rounded-lg bg-[#B38728] text-white"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Book Walk-In
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {agenda.vacantRooms.map((r: any) => (
                      <Badge
                        key={r.id}
                        variant="outline"
                        onClick={() => {
                          setDayAgendaModalDate(null);
                          openNewBookingModal(r.id, dayAgendaModalDate);
                        }}
                        className="p-1.5 px-2.5 text-xs font-medium border-emerald-300 bg-emerald-50 text-emerald-900 cursor-pointer hover:bg-emerald-100"
                      >
                        + {r.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 6. MODAL: CELL QUICK ACTION (When admin clicks on a free cell in Matrix) */}
      <Dialog
        open={!!cellActionData}
        onOpenChange={(open) => !open && setCellActionData(null)}
      >
        <DialogContent className="rounded-2xl max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-display">
              Accommodation Action
            </DialogTitle>
          </DialogHeader>
          {cellActionData && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-400 block uppercase tracking-wider text-[10px] font-bold">
                  Selected Room & Date
                </span>
                <span className="font-extrabold text-sm text-slate-900 block mt-0.5">
                  {cellActionData.room.name}
                </span>
                <span className="text-slate-600 font-medium">
                  {new Date(cellActionData.dateStr).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="grid gap-2">
                <Button
                  className="w-full bg-[#B38728] hover:bg-[#9a721e] text-white font-bold rounded-xl h-10 justify-start px-4 text-xs"
                  onClick={() => {
                    const { room, dateStr } = cellActionData;
                    setCellActionData(null);
                    openNewBookingModal(room.id, dateStr);
                  }}
                >
                  <CalendarPlus className="w-4 h-4 mr-2" /> Book Walk-in / Direct Reservation
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-slate-300 text-slate-700 hover:bg-slate-50 font-bold rounded-xl h-10 justify-start px-4 text-xs"
                  onClick={() => {
                    const { room, dateStr } = cellActionData;
                    setCellActionData(null);
                    setMaintenanceForm({
                      room_id: room.id,
                      start_date: dateStr,
                      end_date: dateStr,
                      notes: "",
                    });
                    setMaintenanceModalOpen(true);
                  }}
                >
                  <Wrench className="w-4 h-4 mr-2 text-slate-500" /> Set Room Maintenance Closure
                </Button>

                <Button
                  variant="ghost"
                  className="w-full text-slate-600 font-bold rounded-xl h-9 justify-start px-4 text-xs"
                  onClick={() => {
                    const { dateStr } = cellActionData;
                    setCellActionData(null);
                    setDayAgendaModalDate(dateStr);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" /> View Day Agenda & All Bookings
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 7. MODAL: DIRECT / WALK-IN RESERVATION MODAL */}
      <Dialog open={newBookingModalOpen} onOpenChange={setNewBookingModalOpen}>
        <DialogContent className="rounded-2xl max-w-lg p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-display text-slate-900 flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-[#B38728]" /> Direct / Walk-In Reservation
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateBookingSubmit} className="space-y-4 py-2">
            {/* Accommodation select */}
            <div>
              <Label className="text-xs font-semibold uppercase text-slate-600">
                Accommodation Room / Villa *
              </Label>
              <Select
                value={bookingForm.room_id}
                onValueChange={(val) => handleBookingFormChange({ room_id: val })}
              >
                <SelectTrigger className="mt-1 rounded-xl text-xs bg-white border-slate-300 h-10">
                  <SelectValue placeholder="Select Accommodation" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} ({r.type === "villa" ? "Function Hall" : r.type || "Room"}) - ₱
                      {Number(r.price).toLocaleString()}/night
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Guest Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">
                  Guest Full Name *
                </Label>
                <Input
                  required
                  placeholder="e.g. Maria Santos"
                  value={bookingForm.guest_name}
                  onChange={(e) => handleBookingFormChange({ guest_name: e.target.value })}
                  className="mt-1 rounded-xl text-xs h-9"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">
                  Contact Phone
                </Label>
                <Input
                  placeholder="0917 123 4567"
                  value={bookingForm.guest_phone}
                  onChange={(e) => handleBookingFormChange({ guest_phone: e.target.value })}
                  className="mt-1 rounded-xl text-xs h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase text-slate-600">
                Guest Email (Optional for receipt & confirmation)
              </Label>
              <Input
                type="email"
                placeholder="guest@example.com"
                value={bookingForm.guest_email}
                onChange={(e) => handleBookingFormChange({ guest_email: e.target.value })}
                className="mt-1 rounded-xl text-xs h-9"
              />
            </div>

            {/* Dates & Guests */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">Check-In *</Label>
                <Input
                  type="date"
                  required
                  value={bookingForm.check_in}
                  onChange={(e) => handleBookingFormChange({ check_in: e.target.value })}
                  className="mt-1 rounded-xl text-xs h-9"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">Check-Out *</Label>
                <Input
                  type="date"
                  required
                  value={bookingForm.check_out}
                  onChange={(e) => handleBookingFormChange({ check_out: e.target.value })}
                  className="mt-1 rounded-xl text-xs h-9"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">Guests</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={bookingForm.guests}
                  onChange={(e) => handleBookingFormChange({ guests: Number(e.target.value) })}
                  className="mt-1 rounded-xl text-xs h-9"
                />
              </div>
            </div>

            {/* Total Amount & Payment Options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">
                  Total Amount (₱) *
                </Label>
                <Input
                  type="number"
                  required
                  value={bookingForm.total_amount}
                  onChange={(e) =>
                    handleBookingFormChange({ total_amount: Number(e.target.value) })
                  }
                  className="mt-1 rounded-xl text-xs font-bold text-[#B38728] h-9 bg-white"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">
                  Payment Status
                </Label>
                <Select
                  value={bookingForm.payment_status}
                  onValueChange={(val: any) => handleBookingFormChange({ payment_status: val })}
                >
                  <SelectTrigger className="mt-1 rounded-xl text-xs bg-white border-slate-300 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verified">Verified (Paid)</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">
                  Method
                </Label>
                <Select
                  value={bookingForm.payment_method}
                  onValueChange={(val: any) => handleBookingFormChange({ payment_method: val })}
                >
                  <SelectTrigger className="mt-1 rounded-xl text-xs bg-white border-slate-300 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash (Counter)</SelectItem>
                    <SelectItem value="gcash">GCash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase text-slate-600">
                Special Requests / Notes
              </Label>
              <Textarea
                placeholder="Walk-in notes, extra foam bed, specific requests..."
                rows={2}
                value={bookingForm.special_requests}
                onChange={(e) => handleBookingFormChange({ special_requests: e.target.value })}
                className="mt-1 rounded-xl text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewBookingModalOpen(false)}
                className="rounded-xl font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingBooking}
                className="rounded-xl font-bold bg-[#B38728] hover:bg-[#9a721e] text-white"
              >
                {creatingBooking ? "Confirming..." : "Confirm & Save Booking"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 8. MODAL: ROOM MAINTENANCE MODAL */}
      <Dialog open={maintenanceModalOpen} onOpenChange={setMaintenanceModalOpen}>
        <DialogContent className="rounded-2xl max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-display text-slate-800 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-slate-600" /> Accommodation Maintenance
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleMaintenanceSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold uppercase text-slate-600">
                Select Accommodation *
              </Label>
              <Select
                value={maintenanceForm.room_id}
                onValueChange={(val) => setMaintenanceForm({ ...maintenanceForm, room_id: val })}
              >
                <SelectTrigger className="mt-1 rounded-xl text-xs bg-white border-slate-300">
                  <SelectValue placeholder="Choose room to set maintenance" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} {r.status === "maintenance" ? "(Currently in Maintenance)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">Start Date</Label>
                <Input
                  type="date"
                  required
                  value={maintenanceForm.start_date}
                  onChange={(e) =>
                    setMaintenanceForm({ ...maintenanceForm, start_date: e.target.value })
                  }
                  className="mt-1 rounded-xl text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">End Date</Label>
                <Input
                  type="date"
                  required
                  value={maintenanceForm.end_date}
                  onChange={(e) =>
                    setMaintenanceForm({ ...maintenanceForm, end_date: e.target.value })
                  }
                  className="mt-1 rounded-xl text-xs"
                />
              </div>
            </div>

            <Button type="submit" className="w-full rounded-xl font-bold bg-slate-800 text-white">
              Schedule Maintenance Closure
            </Button>
          </form>

          {/* List of currently scheduled room maintenance */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">
              Active Room Maintenance
            </h4>
            {rooms.filter((r: any) => r.status === "maintenance" || r.maintenance_start).length ===
            0 ? (
              <p className="text-xs text-slate-400 italic">No rooms currently in maintenance.</p>
            ) : (
              <div className="space-y-2">
                {rooms
                  .filter((r: any) => r.status === "maintenance" || r.maintenance_start)
                  .map((r: any) => (
                    <div
                      key={r.id}
                      className="flex justify-between items-center text-xs border p-2.5 rounded-xl bg-slate-50"
                    >
                      <div>
                        <span className="font-bold text-slate-900 block">{r.name}</span>
                        <span className="text-[10px] text-slate-500">
                          {r.maintenance_start || "Active"} to {r.maintenance_end || "Ongoing"}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => clearRoomMaintenance(r.id)}
                        className="h-7 px-2.5 text-xs font-bold text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      >
                        Restore Room
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 9. MODAL: RESORT OVERRIDE BLOCK MODAL */}
      <Dialog open={blockModalOpen} onOpenChange={setBlockModalOpen}>
        <DialogContent className="rounded-2xl max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-display text-rose-700 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> Block Resort Dates Override
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBlockSubmit} className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">Start Date</Label>
                <Input
                  type="date"
                  required
                  className="mt-1 rounded-xl text-xs"
                  value={blockForm.start_date}
                  onChange={(e) => setBlockForm({ ...blockForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase text-slate-600">End Date</Label>
                <Input
                  type="date"
                  required
                  className="mt-1 rounded-xl text-xs"
                  value={blockForm.end_date}
                  onChange={(e) => setBlockForm({ ...blockForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase text-slate-600">
                Reason (Optional)
              </Label>
              <Input
                placeholder="e.g. Private Resort Buyout, Typhoon, Renovation"
                className="mt-1 rounded-xl text-xs"
                value={blockForm.reason}
                onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
              />
            </div>
            <Button type="submit" variant="destructive" className="rounded-xl font-bold mt-2">
              Apply Resort Block
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-200">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">
              Active Resort Blocks
            </h4>
            {blocks.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No active blocks configured.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {blocks.map((b: any) => (
                  <li
                    key={b.id}
                    className="flex justify-between items-center text-xs border p-2.5 rounded-xl bg-slate-50 font-medium"
                  >
                    <span>
                      <strong>{b.start_date}</strong> to <strong>{b.end_date}</strong>{" "}
                      {b.reason && <span className="text-slate-500">({b.reason})</span>}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50 h-7 px-2 font-bold"
                      onClick={async () => {
                        await supabase.from("resort_blocks" as any).delete().eq("id", b.id);
                        refetch();
                        qc.invalidateQueries({ queryKey: ["global-availability"] });
                        toast.success("Resort block removed");
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 10. MODAL: SELECTED BOOKING DETAIL & MANAGEMENT QUICK VIEW */}
      <Dialog
        open={!!selectedBooking}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
      >
        <DialogContent className="rounded-2xl max-w-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-display flex items-center justify-between">
              <span>Reservation Overview</span>
              {selectedBooking && (
                <Badge
                  className={cn(
                    "capitalize text-xs font-bold px-2.5 py-0.5",
                    selectedBooking.status === "approved"
                      ? "bg-emerald-600 text-white"
                      : selectedBooking.status === "pending"
                      ? "bg-amber-500 text-white"
                      : selectedBooking.status === "completed"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-600 text-white"
                  )}
                >
                  {selectedBooking.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4 py-2">
              {/* Information Grid */}
              <div className="grid grid-cols-2 gap-3.5 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                    Guest Name
                  </span>
                  <span className="font-bold text-slate-900 text-sm">
                    {selectedBooking.guest_name}
                  </span>
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                    Contact Phone
                  </span>
                  <span className="font-semibold text-slate-900">
                    {selectedBooking.guest_phone || "None provided"}
                  </span>
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                    Email Address
                  </span>
                  <span className="font-semibold text-slate-800 break-all">
                    {selectedBooking.guest_email || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                    Accommodation
                  </span>
                  <span className="font-bold text-slate-900">
                    {selectedBooking.room?.name || selectedBooking.room_id}
                  </span>
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                    Check-In Date
                  </span>
                  <span className="font-bold text-emerald-700">
                    {selectedBooking.check_in}
                  </span>
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                    Check-Out Date
                  </span>
                  <span className="font-bold text-blue-700">
                    {selectedBooking.check_out}
                  </span>
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                    Total Amount
                  </span>
                  <span className="text-[#B38728] font-black text-base font-display">
                    ₱{Number(selectedBooking.total_amount).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                    Payment Status
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize text-[10px] font-bold",
                        selectedBooking.payments?.[0]?.status === "verified"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                          : "border-amber-500 bg-amber-50 text-amber-800"
                      )}
                    >
                      {selectedBooking.payments?.[0]?.status || "Unpaid"}
                    </Badge>
                    <button
                      type="button"
                      onClick={() =>
                        handleTogglePaymentVerified(
                          selectedBooking.id,
                          selectedBooking.payments?.[0]?.status || "unpaid"
                        )
                      }
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      Toggle Paid
                    </button>
                  </div>
                </div>

                {selectedBooking.special_requests && (
                  <div className="col-span-2 pt-2 border-t border-slate-200">
                    <span className="font-bold uppercase tracking-wider text-slate-400 block mb-0.5 text-[10px]">
                      Special Requests / Notes
                    </span>
                    <p className="text-slate-700 text-xs italic bg-white p-2 rounded-lg border border-slate-200">
                      {selectedBooking.special_requests}
                    </p>
                  </div>
                )}
              </div>

              {/* Operational Action Controls */}
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedBooking.status === "pending" && (
                  <>
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-10 text-xs"
                      onClick={() => handleUpdateBookingStatus(selectedBooking.id, "approved")}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve Reservation
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 font-bold rounded-xl h-10 text-xs"
                      onClick={() => handleUpdateBookingStatus(selectedBooking.id, "rejected")}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" /> Reject
                    </Button>
                  </>
                )}

                {selectedBooking.status === "approved" && (
                  <>
                    <Button
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-10 text-xs"
                      onClick={() => handleUpdateBookingStatus(selectedBooking.id, "completed")}
                    >
                      <Check className="w-4 h-4 mr-1.5" /> Complete Stay / Check-Out
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-xl h-10 text-xs font-bold text-amber-700 border-amber-300 hover:bg-amber-50"
                      onClick={() => handleUpdateBookingStatus(selectedBooking.id, "no-show")}
                    >
                      Mark No-Show
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-xl h-10 text-xs font-bold"
                      onClick={() => handleUpdateBookingStatus(selectedBooking.id, "cancelled")}
                    >
                      Cancel
                    </Button>
                  </>
                )}

                <Link
                  to="/admin/bookings"
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-bold pt-2 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open Full Details in Bookings Ledger
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
