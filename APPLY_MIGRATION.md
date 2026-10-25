# IMPORTANT: Run this SQL in your Supabase SQL Editor
### Dashboard → SQL Editor → New Query → Paste → Click Run

```sql
-- ============================================================
-- 0. Create admin_sessions Table for Multi-Device Login Management
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Workstation',
  browser_name TEXT NOT NULL DEFAULT 'Web Browser',
  os_name TEXT NOT NULL DEFAULT 'Unknown OS',
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON public.admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_status ON public.admin_sessions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_sessions TO anon, authenticated, service_role;

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_sessions_read" ON public.admin_sessions;
CREATE POLICY "admin_sessions_read" ON public.admin_sessions
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "admin_sessions_insert" ON public.admin_sessions;
CREATE POLICY "admin_sessions_insert" ON public.admin_sessions
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_sessions_update" ON public.admin_sessions;
CREATE POLICY "admin_sessions_update" ON public.admin_sessions
  FOR UPDATE TO authenticated, anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_sessions_delete" ON public.admin_sessions;
CREATE POLICY "admin_sessions_delete" ON public.admin_sessions
  FOR DELETE TO authenticated, anon
  USING (true);

-- ============================================================
-- 1. Create resort_blocks Table with RLS & Indices
-- ============================================================

CREATE TABLE IF NOT EXISTS public.resort_blocks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL CHECK (end_date >= start_date),
  reason      TEXT        DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
  CONSTRAINT no_empty_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_resort_blocks_start ON public.resort_blocks(start_date);
CREATE INDEX IF NOT EXISTS idx_resort_blocks_end   ON public.resort_blocks(end_date);

GRANT SELECT ON public.resort_blocks TO anon;
GRANT SELECT ON public.resort_blocks TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.resort_blocks TO authenticated;
GRANT ALL ON public.resort_blocks TO service_role;

ALTER TABLE public.resort_blocks ENABLE ROW LEVEL SECURITY;

-- Read policy: Anyone can read blocked dates to see unavailable dates
DROP POLICY IF EXISTS "resort_blocks_read_all" ON public.resort_blocks;
CREATE POLICY "resort_blocks_read_all"
  ON public.resort_blocks FOR SELECT USING (true);

-- Admin management policies
DROP POLICY IF EXISTS "resort_blocks_admin_insert" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_insert"
  ON public.resort_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "resort_blocks_admin_delete" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_delete"
  ON public.resort_blocks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "resort_blocks_admin_update" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_update"
  ON public.resort_blocks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 2. Concurrency-Safe Trigger Enforcing Resort Blocks & Availability
-- ============================================================

DROP POLICY IF EXISTS "anyone view booking schedule" ON public.bookings;
CREATE POLICY "anyone view booking schedule" ON public.bookings
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND status IN ('pending', 'approved'));

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

  -- 3. Detect overlapping active reservations
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

-- ============================================================
-- 3. Cancellation Fields on Bookings Table
-- ============================================================

ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_cancellation 
  ON public.bookings (status, cancelled_at) 
  WHERE status IN ('cancelled', 'rejected');

-- Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
```

---

### What this achieves:
1. Creates the `resort_blocks` table with Row-Level Security so that customers can read unavailable dates, and only admins can block/unblock dates.
2. Updates `prevent_double_booking()` database trigger to strictly reject any booking for dates overlapping a resort block at the database level.
3. Adds `cancellation_reason`, `cancelled_at`, `cancelled_by`, and `cancelled_by_name` directly to `public.bookings` so cancellation reasons and initiator (Customer, Admin, System) are accurately recorded and displayed in the Admin Dashboard without RLS issues.
4. Automatically reloads the PostgREST schema cache so no errors occur.
