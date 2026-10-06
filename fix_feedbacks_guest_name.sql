-- ==============================================================================
-- FIX: DISPLAY GUEST NAMES ON FEEDBACKS / REVIEWS ("Loved by our guests")
-- Run this in your Supabase Project -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Add guest_name column to public.feedbacks table if not present
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- 2. Backfill existing feedbacks with guest names from public.bookings
UPDATE public.feedbacks f
SET guest_name = b.guest_name
FROM public.bookings b
WHERE f.booking_id = b.id 
  AND b.guest_name IS NOT NULL 
  AND b.guest_name <> ''
  AND (f.guest_name IS NULL OR f.guest_name = '');

-- 3. Backfill any remaining feedbacks with full names from public.profiles
UPDATE public.feedbacks f
SET guest_name = p.fullname
FROM public.profiles p
WHERE f.user_id = p.id 
  AND p.fullname IS NOT NULL 
  AND p.fullname <> ''
  AND (f.guest_name IS NULL OR f.guest_name = '');

-- 4. Backfill any remaining feedbacks from auth.users (email username or raw metadata)
UPDATE public.feedbacks f
SET guest_name = COALESCE(
  NULLIF(u.raw_user_meta_data->>'fullname', ''),
  NULLIF(u.raw_user_meta_data->>'full_name', ''),
  NULLIF(split_part(u.email, '@', 1), '')
)
FROM auth.users u
WHERE f.user_id = u.id 
  AND (f.guest_name IS NULL OR f.guest_name = '');

-- 5. Create or replace secure RPC function to get approved feedbacks with resolved guest names
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
    COALESCE(
      NULLIF(f.guest_name, ''),
      NULLIF(b.guest_name, ''),
      NULLIF(p.fullname, ''),
      'Verified Guest'
    ) AS guest_name,
    f.created_at
  FROM public.feedbacks f
  LEFT JOIN public.bookings b ON f.booking_id = b.id
  LEFT JOIN public.profiles p ON f.user_id = p.id
  WHERE f.is_approved = true
  ORDER BY f.created_at DESC;
$$;

-- 6. Grant execute permissions to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.get_approved_feedbacks() TO anon, authenticated;

-- 7. Notify PostgREST to immediately refresh its schema cache
NOTIFY pgrst, 'reload schema';
