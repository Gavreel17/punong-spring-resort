# IMPORTANT: Run these SQLs in your Supabase SQL Editor
# Dashboard → SQL Editor → New Query → Paste → Click Run

---

## 1. Double-Booking Prevention Migration
File: `supabase/migrations/20261023220000_prevent_double_booking_trigger.sql`

```sql
DROP POLICY IF EXISTS "anyone view booking schedule" ON public.bookings;
CREATE POLICY "anyone view booking schedule" ON public.bookings
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND status IN ('pending', 'approved'));

CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS TRIGGER AS $$
DECLARE v_conflict RECORD;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.rooms WHERE id = NEW.room_id FOR UPDATE;
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
    RAISE EXCEPTION 'UNAVAILABLE: This accommodation is already booked for the selected dates.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_double_booking ON public.bookings;
CREATE TRIGGER trg_prevent_double_booking
  BEFORE INSERT OR UPDATE OF room_id, check_in, check_out, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_double_booking();
```

---

## 2. ⚠️ CRITICAL – Resort Blocks Table (fixes "Failed to block dates" error)
File: `supabase/migrations/20261024000000_create_resort_blocks_table.sql`

The `resort_blocks` table **must exist in Supabase** for the Block Resort Dates feature to work.
Run this SQL in **Supabase Dashboard → SQL Editor → New Query**:

```sql
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

-- Policy: Anyone (including anon) can read blocks to display unavailable dates
DROP POLICY IF EXISTS "resort_blocks_read_all" ON public.resort_blocks;
CREATE POLICY "resort_blocks_read_all"
  ON public.resort_blocks FOR SELECT USING (true);

-- Policy: Only admins can insert new blocks
DROP POLICY IF EXISTS "resort_blocks_admin_insert" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_insert"
  ON public.resort_blocks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Policy: Only admins can delete blocks
DROP POLICY IF EXISTS "resort_blocks_admin_delete" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_delete"
  ON public.resort_blocks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Only admins can update blocks
DROP POLICY IF EXISTS "resort_blocks_admin_update" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_update"
  ON public.resort_blocks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Notify PostgREST to refresh its schema cache immediately
NOTIFY pgrst, 'reload schema';
```

After running this SQL:
- Go to Admin → Calendar → Block Resort Dates Override
- Enter Start Date, End Date, optional Reason
- Click **Apply Resort Block** — it will now save successfully
- The blocked dates will appear in the Active Resort Blocks list
- Customers cannot book during blocked dates
- Walk-in reservations are also blocked during those dates
