-- Migration: Allow all users (including anonymous and customers) to view booked date schedules
-- This allows the booking calendar to display already booked dates in red and prevent double-booking.

-- 1. Enable viewing active bookings schedule for anon & authenticated users
DROP POLICY IF EXISTS "anyone view booking schedule" ON public.bookings;
CREATE POLICY "anyone view booking schedule" ON public.bookings
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL 
    AND status NOT IN ('cancelled', 'rejected', 'no-show')
  );

-- 2. Create RPC function as an additional secure fallback
CREATE OR REPLACE FUNCTION public.get_room_booked_dates(p_room_id UUID)
RETURNS TABLE (
  id UUID,
  room_id UUID,
  check_in DATE,
  check_out DATE,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    b.id,
    b.room_id,
    b.check_in::DATE,
    b.check_out::DATE,
    b.status::TEXT
  FROM public.bookings b
  WHERE b.room_id = p_room_id
    AND b.deleted_at IS NULL
    AND b.status NOT IN ('cancelled', 'rejected', 'no-show');
$$;

GRANT EXECUTE ON FUNCTION public.get_room_booked_dates(UUID) TO anon, authenticated;
