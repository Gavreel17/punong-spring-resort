-- Migration: Concurrency-Safe Double Booking Prevention Trigger & Schedule View Policy
-- Punong Spring Resort Management System

-- 1. Ensure anon and authenticated users can view active booking schedules across all channels
DROP POLICY IF EXISTS "anyone view booking schedule" ON public.bookings;
CREATE POLICY "anyone view booking schedule" ON public.bookings
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL 
    AND status IN ('pending', 'approved')
  );

-- 2. Concurrency-Safe Double Booking Trigger
CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_conflict RECORD;
BEGIN
  -- Only validate active blocking reservations
  IF NEW.deleted_at IS NOT NULL OR NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;

  -- Lock the target accommodation row to serialize concurrent booking transactions
  PERFORM 1 FROM public.rooms WHERE id = NEW.room_id FOR UPDATE;

  -- Detect overlapping active reservations using exact overlap formula:
  -- new_check_in < existing_check_out AND new_check_out > existing_check_in
  -- with single-day (day use where check_in = check_out) handling
  SELECT id, guest_name, check_in, check_out, status INTO v_conflict
  FROM public.bookings
  WHERE room_id = NEW.room_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND deleted_at IS NULL
    AND status IN ('pending', 'approved')
    AND (
      CASE 
        WHEN check_in = check_out OR NEW.check_in = NEW.check_out THEN
          NEW.check_in <= check_out AND NEW.check_out >= check_in
        ELSE
          NEW.check_in < check_out AND NEW.check_out > check_in
      END
    )
  LIMIT 1;

  IF v_conflict.id IS NOT NULL THEN
    RAISE EXCEPTION 'UNAVAILABLE: This accommodation is already booked for the selected dates by another customer. Please choose another available accommodation or select different dates.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_double_booking ON public.bookings;
CREATE TRIGGER trg_prevent_double_booking
  BEFORE INSERT OR UPDATE OF room_id, check_in, check_out, status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_double_booking();
