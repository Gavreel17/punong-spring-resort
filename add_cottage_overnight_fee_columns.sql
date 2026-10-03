-- Migration: Add stay_type and overnight_fee to public.bookings for Cottages
-- You can run this in your Supabase SQL Editor if not already applied.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS stay_type TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS overnight_fee NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.bookings.stay_type IS 'Stay type for cottage reservations: day_use or overnight. NULL for rooms and function halls.';
COMMENT ON COLUMN public.bookings.overnight_fee IS 'Overnight cottage fee: 1000 for overnight cottage stays, 0 for day use, 0 for rooms and function halls.';
