-- ============================================================
-- Fix: Shared booking visibility across all users
-- Run this in your Supabase SQL Editor
-- ============================================================

-- STEP 1: Drop the old restrictive "view own bookings" policy
-- that prevented customers from seeing other users' bookings.
DROP POLICY IF EXISTS "view own bookings" ON public.bookings;

-- STEP 2: Create a new policy so every authenticated user can
-- read ALL bookings (needed to show red/booked dates globally).
-- Personal guest details (name, phone, email) are still protected
-- at the application layer; the calendar only uses dates + status.
CREATE POLICY "all authenticated users view bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (true);

-- STEP 3: Create a server-side function to atomically check for
-- booking conflicts. This prevents double-booking even when two
-- users submit at nearly the same time.
CREATE OR REPLACE FUNCTION public.check_booking_conflict(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE
)
RETURNS BOOLEAN   -- returns TRUE if conflict exists (slot already booked)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE room_id   = p_room_id
      AND deleted_at IS NULL
      AND status NOT IN ('cancelled', 'rejected')
      -- Overlap condition: existing booking overlaps with requested range
      AND check_in  <= p_check_out
      AND check_out >= p_check_in
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_booking_conflict(UUID, DATE, DATE) TO authenticated;

-- STEP 4 (recommended): Create a function to safely insert a
-- booking only if no conflict exists (atomic with advisory lock).
-- This is the strongest protection against race conditions.
CREATE OR REPLACE FUNCTION public.insert_booking_if_available(
  p_user_id          UUID,
  p_room_id          UUID,
  p_guest_name       TEXT,
  p_guest_email      TEXT,
  p_guest_phone      TEXT,
  p_check_in         DATE,
  p_check_out        DATE,
  p_guests           INT,
  p_total_amount     NUMERIC,
  p_special_requests TEXT,
  p_stay_type        TEXT DEFAULT NULL,
  p_overnight_fee    NUMERIC DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_conflict BOOLEAN;
  v_booking  public.bookings%ROWTYPE;
BEGIN
  -- Lock per room to prevent concurrent inserts for same room
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  -- Re-check for conflicts inside the lock
  SELECT public.check_booking_conflict(p_room_id, p_check_in, p_check_out)
    INTO v_conflict;

  IF v_conflict THEN
    RETURN json_build_object(
      'success', false,
      'error', 'This slot has already been booked and is no longer available.'
    );
  END IF;

  -- Safe to insert
  INSERT INTO public.bookings (
    user_id, room_id, guest_name, guest_email, guest_phone,
    check_in, check_out, guests, total_amount, special_requests,
    status, stay_type, overnight_fee
  ) VALUES (
    p_user_id, p_room_id, p_guest_name, p_guest_email, p_guest_phone,
    p_check_in, p_check_out, p_guests, p_total_amount, p_special_requests,
    'approved', p_stay_type, p_overnight_fee
  )
  RETURNING * INTO v_booking;

  RETURN json_build_object(
    'success', true,
    'booking', row_to_json(v_booking)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_booking_if_available(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, INT, NUMERIC, TEXT, TEXT, NUMERIC) TO authenticated;
