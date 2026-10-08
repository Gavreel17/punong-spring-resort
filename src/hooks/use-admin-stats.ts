import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPhilippineTime, processAutoBookingStatuses } from "@/lib/booking-utils";

export interface AdminKpiStats {
  totalBookings: number;
  monthBookings: number;
  occupancyRate: number;
  occupiedRoomsCount: number;
  totalRoomsCount: number;
  resortGuests: number;
  totalRevenue: number;
  approvedCount: number;
  completedCount: number;
  pendingCount: number;
  cancelledCount: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  allBookings: any[];
  allRooms: any[];
  isLoading: boolean;
  refetch: () => void;
}

export function useAdminStats(): AdminKpiStats {
  const query = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { dateStr: todayStr } = getPhilippineTime();
      const currentMonthPrefix = todayStr.substring(0, 7);

      const [bookingsRes, profilesRes, roomsRes, paymentsRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, status, total_amount, check_in, check_out, created_at, guest_name, room_id, room:rooms(name, type), payments(id, status, amount)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("rooms")
          .select("id, name, type, status, is_available, maintenance_start, maintenance_end")
          .neq("status", "deleted"),
        supabase
          .from("payments")
          .select("id, amount, status, booking_id")
          .eq("status", "verified"),
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (roomsRes.error) throw roomsRes.error;

      if (bookingsRes.data && bookingsRes.data.length > 0) {
        await processAutoBookingStatuses(bookingsRes.data);
      }

      const bookings = bookingsRes.data || [];
      const rooms = roomsRes.data || [];
      const customersCount = profilesRes.count ?? 0;
      const verifiedPayments = paymentsRes.data || [];

      // Map verified payments by booking_id
      const verifiedPaymentMap = new Map<string, number>();
      verifiedPayments.forEach((p: any) => {
        if (p.booking_id) {
          verifiedPaymentMap.set(
            p.booking_id,
            (verifiedPaymentMap.get(p.booking_id) || 0) + Number(p.amount || 0)
          );
        }
      });

      let approvedCount = 0;
      let completedCount = 0;
      let pendingCount = 0;
      let cancelledCount = 0;
      let monthBookings = 0;
      let todayCheckIns = 0;
      let todayCheckOuts = 0;
      let totalRevenue = 0;

      bookings.forEach((b: any) => {
        const status = (b.status || "").toLowerCase();
        const hasVerifiedPayment =
          verifiedPaymentMap.has(b.id) ||
          b.payments?.some((p: any) => (p.status || "").toLowerCase() === "verified");
        const isApprovedOrCompleted = status === "approved" || status === "completed";

        if (status === "approved") approvedCount++;
        else if (status === "completed") completedCount++;
        else if (status === "pending") pendingCount++;
        else if (status === "cancelled" || status === "rejected") cancelledCount++;

        if (b.created_at && b.created_at.startsWith(currentMonthPrefix)) {
          monthBookings++;
        }

        if (b.check_in === todayStr && isApprovedOrCompleted) {
          todayCheckIns++;
        }
        if (b.check_out === todayStr && isApprovedOrCompleted) {
          todayCheckOuts++;
        }

        // Verified Revenue:
        // Any booking that is approved or completed, OR has a verified payment
        if (isApprovedOrCompleted || hasVerifiedPayment) {
          const bookingAmount = Number(b.total_amount || 0);
          const paymentAmount = verifiedPaymentMap.get(b.id) || 0;
          totalRevenue += bookingAmount > 0 ? bookingAmount : paymentAmount;
        }
      });

      // Occupancy Rate:
      // Count rooms that are occupied today
      let occupiedRoomsCount = 0;
      const totalRoomsCount = rooms.length;

      rooms.forEach((room: any) => {
        let isOccupied = false;

        // Check maintenance status
        if (room.status === "maintenance") {
          if (room.maintenance_start && room.maintenance_end) {
            if (todayStr >= room.maintenance_start && todayStr <= room.maintenance_end) {
              isOccupied = true;
            }
          } else {
            isOccupied = true;
          }
        }

        // Check active bookings covering today
        if (!isOccupied) {
          const roomBookings = bookings.filter(
            (bk: any) =>
              bk.room_id === room.id &&
              (bk.status === "approved" || bk.status === "completed")
          );

          for (const bk of roomBookings) {
            if (todayStr >= bk.check_in && todayStr <= bk.check_out) {
              isOccupied = true;
              break;
            }
          }
        }

        if (isOccupied) {
          occupiedRoomsCount++;
        }
      });

      const occupancyRate =
        totalRoomsCount > 0
          ? Math.round((occupiedRoomsCount / totalRoomsCount) * 100)
          : 0;

      return {
        totalBookings: bookings.length,
        monthBookings,
        occupancyRate,
        occupiedRoomsCount,
        totalRoomsCount,
        resortGuests: customersCount,
        totalRevenue,
        approvedCount,
        completedCount,
        pendingCount,
        cancelledCount,
        todayCheckIns,
        todayCheckOuts,
        allBookings: bookings,
        allRooms: rooms,
      };
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  return {
    totalBookings: query.data?.totalBookings ?? 0,
    monthBookings: query.data?.monthBookings ?? 0,
    occupancyRate: query.data?.occupancyRate ?? 0,
    occupiedRoomsCount: query.data?.occupiedRoomsCount ?? 0,
    totalRoomsCount: query.data?.totalRoomsCount ?? 0,
    resortGuests: query.data?.resortGuests ?? 0,
    totalRevenue: query.data?.totalRevenue ?? 0,
    approvedCount: query.data?.approvedCount ?? 0,
    completedCount: query.data?.completedCount ?? 0,
    pendingCount: query.data?.pendingCount ?? 0,
    cancelledCount: query.data?.cancelledCount ?? 0,
    todayCheckIns: query.data?.todayCheckIns ?? 0,
    todayCheckOuts: query.data?.todayCheckOuts ?? 0,
    allBookings: query.data?.allBookings ?? [],
    allRooms: query.data?.allRooms ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
