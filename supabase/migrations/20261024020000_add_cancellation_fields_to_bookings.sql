-- Migration: Add cancellation fields to bookings table
-- Enables tracking cancellation reason, timestamp, and actor directly on the bookings record

ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;

-- Index for cancellation queries and audit logs
CREATE INDEX IF NOT EXISTS idx_bookings_cancellation 
  ON public.bookings (status, cancelled_at) 
  WHERE status IN ('cancelled', 'rejected');

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
