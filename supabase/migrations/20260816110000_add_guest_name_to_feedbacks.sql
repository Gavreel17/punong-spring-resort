-- Add guest_name column to public.feedbacks table
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Backfill guest_name from public.bookings
UPDATE public.feedbacks f
SET guest_name = b.guest_name
FROM public.bookings b
WHERE f.booking_id = b.id AND (f.guest_name IS NULL OR f.guest_name = '');

-- Backfill any remaining from public.profiles
UPDATE public.feedbacks f
SET guest_name = p.fullname
FROM public.profiles p
WHERE f.user_id = p.id AND (f.guest_name IS NULL OR f.guest_name = '');

-- Create security definer function to return approved feedbacks with guest names for all visitors (anon & auth)
CREATE OR REPLACE FUNCTION public.get_approved_feedbacks()
RETURNS TABLE (
  id UUID,
  rating INT,
  comment TEXT,
  guest_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    f.id,
    f.rating,
    f.comment,
    COALESCE(NULLIF(f.guest_name, ''), NULLIF(b.guest_name, ''), NULLIF(p.fullname, ''), split_part(u.email, '@', 1), 'Verified Guest') AS guest_name,
    f.created_at
  FROM public.feedbacks f
  LEFT JOIN public.bookings b ON f.booking_id = b.id
  LEFT JOIN public.profiles p ON f.user_id = p.id
  LEFT JOIN auth.users u ON f.user_id = u.id
  WHERE f.is_approved = true
  ORDER BY f.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_approved_feedbacks() TO anon, authenticated;
