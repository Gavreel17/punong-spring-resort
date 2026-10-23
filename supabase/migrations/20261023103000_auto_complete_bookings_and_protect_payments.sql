-- ==============================================================================
-- AUTOMATIC BOOKING COMPLETION AND COMPLETED PAYMENT PROTECTION
-- Punong Spring Resort Database Migration
-- 
-- 1. auto_complete_past_bookings(): Atomically marks eligible past bookings as
--    'completed' based on Philippine Time (Asia/Manila, UTC+08:00).
-- 2. protect_completed_booking_payment: Rejects any attempt to undo or reverse
--    payment on a booking whose status is 'completed'.
-- 3. protect_completed_booking_status: Prevents accidental reversal of a
--    completed booking back to 'approved', 'pending', or other statuses.
-- ==============================================================================

-- 1. Automatic booking completion function
CREATE OR REPLACE FUNCTION public.auto_complete_past_bookings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_ph DATE;
  v_count INT;
BEGIN
  -- Current date in Philippine Time (Asia/Manila, UTC+08:00)
  v_today_ph := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::DATE;

  -- Update eligible bookings where checkout date has strictly passed (check_out < v_today_ph)
  -- Stays where checkout is TODAY remain active until the day has fully passed.
  -- Exclude already completed, cancelled, rejected, and no-show reservations.
  UPDATE public.bookings
  SET status = 'completed',
      updated_at = now()
  WHERE check_out < v_today_ph
    AND status NOT IN ('completed', 'cancelled', 'rejected', 'no-show')
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'ph_today', v_today_ph,
    'completed_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_complete_past_bookings() TO authenticated, service_role, anon;

-- 2. Protect completed booking status from reverting
CREATE OR REPLACE FUNCTION public.protect_completed_booking_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'A completed booking cannot be reverted to a previous status.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_completed_booking ON public.bookings;
CREATE TRIGGER trg_protect_completed_booking
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_completed_booking_status();

-- 3. Protect completed booking payment from undo / reversal
CREATE OR REPLACE FUNCTION public.protect_completed_booking_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking_status public.booking_status;
BEGIN
  IF OLD.status = 'verified' AND NEW.status IN ('unpaid', 'pending') THEN
    SELECT status INTO v_booking_status
    FROM public.bookings
    WHERE id = NEW.booking_id;

    IF v_booking_status = 'completed' THEN
      RAISE EXCEPTION 'Payment cannot be undone because this booking is already completed.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_completed_booking_payment ON public.payments;
CREATE TRIGGER trg_protect_completed_booking_payment
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_completed_booking_payment();
