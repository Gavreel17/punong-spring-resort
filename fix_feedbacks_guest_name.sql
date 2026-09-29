-- Run this in your Supabase SQL Editor if you want to store guest_name directly in public.feedbacks:

ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Backfill existing feedbacks with guest names from bookings
UPDATE public.feedbacks f
SET guest_name = b.guest_name
FROM public.bookings b
WHERE f.booking_id = b.id AND (f.guest_name IS NULL OR f.guest_name = '');

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
