-- Add deleted_at column to bookings for soft delete functionality
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
