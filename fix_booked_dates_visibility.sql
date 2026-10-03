-- Run this in your Supabase SQL Editor if needed to allow the calendar to show booked dates in red
-- and prevent double-booking for all users (including anonymous visitors and logged-in customers).

DROP POLICY IF EXISTS "anyone view booking schedule" ON public.bookings;
CREATE POLICY "anyone view booking schedule" ON public.bookings
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL 
    AND status NOT IN ('cancelled', 'rejected')
  );

-- Function fallback with elevated security definer rights
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
    AND b.status NOT IN ('cancelled', 'rejected');
$$;

GRANT EXECUTE ON FUNCTION public.get_room_booked_dates(UUID) TO anon, authenticated;
