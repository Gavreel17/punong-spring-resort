-- ============================================================
-- Migration: Create resort_blocks table
-- Purpose: Allows admins to block resort-wide date ranges that
--          prevent all new bookings (online + walk-in) for those dates.
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

-- Indexes for fast overlap queries
CREATE INDEX IF NOT EXISTS idx_resort_blocks_start ON public.resort_blocks(start_date);
CREATE INDEX IF NOT EXISTS idx_resort_blocks_end   ON public.resort_blocks(end_date);

-- Grant permissions
GRANT SELECT ON public.resort_blocks TO anon;
GRANT SELECT ON public.resort_blocks TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.resort_blocks TO authenticated;
GRANT ALL ON public.resort_blocks TO service_role;

-- Enable Row Level Security
ALTER TABLE public.resort_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone (including anon) can read blocks to display unavailable dates
DROP POLICY IF EXISTS "resort_blocks_read_all" ON public.resort_blocks;
CREATE POLICY "resort_blocks_read_all"
  ON public.resort_blocks FOR SELECT
  USING (true);

-- Policy: Only admins can insert new blocks
DROP POLICY IF EXISTS "resort_blocks_admin_insert" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_insert"
  ON public.resort_blocks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
  );

-- Policy: Only admins can delete blocks
DROP POLICY IF EXISTS "resort_blocks_admin_delete" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_delete"
  ON public.resort_blocks FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  );

-- Policy: Only admins can update blocks
DROP POLICY IF EXISTS "resort_blocks_admin_update" ON public.resort_blocks;
CREATE POLICY "resort_blocks_admin_update"
  ON public.resort_blocks FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Notify PostgREST to reload the schema cache immediately
NOTIFY pgrst, 'reload schema';
