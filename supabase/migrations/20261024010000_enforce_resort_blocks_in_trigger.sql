-- ============================================================
-- Migration: Enforce Resort Blocks in Concurrency-Safe Trigger
-- Punong Spring Resort Management System
-- Purpose: Guarantees that ANY attempt to insert or update a booking
--          overlapping an active resort block is strictly rejected
--          at the database level (online, walk-in, and direct API).
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_conflict RECORD;
  v_block RECORD;
BEGIN
  -- Only validate active blocking reservations
  IF NEW.deleted_at IS NOT NULL OR NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;

  -- 1. Check active resort-wide blocks
  -- Overlap logic:
  -- If same-day booking (check_in = check_out), conflict if check_in between start_date and end_date
  -- If range booking, conflict if new_check_in < block.end_date AND new_check_out > block.start_date
  SELECT id, start_date, end_date, reason INTO v_block
  FROM public.resort_blocks
  WHERE (
    CASE 
      WHEN NEW.check_in = NEW.check_out THEN
        NEW.check_in <= end_date AND NEW.check_out >= start_date
      ELSE
        NEW.check_in < end_date AND NEW.check_out > start_date
    END
  )
  LIMIT 1;

  IF v_block.id IS NOT NULL THEN
    RAISE EXCEPTION 'RESORT_BLOCKED: The resort is closed/blocked from % to % (Reason: %). Please choose different dates.',
      v_block.start_date, v_block.end_date, COALESCE(v_block.reason, 'Administrative Closure');
  END IF;

  -- 2. Lock the target accommodation row to serialize concurrent booking transactions
  PERFORM 1 FROM public.rooms WHERE id = NEW.room_id FOR UPDATE;

  -- 3. Detect overlapping active reservations using exact overlap formula:
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

-- Re-attach trigger
DROP TRIGGER IF EXISTS trg_prevent_double_booking ON public.bookings;
CREATE TRIGGER trg_prevent_double_booking
  BEFORE INSERT OR UPDATE OF room_id, check_in, check_out, status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_double_booking();
