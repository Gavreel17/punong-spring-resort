-- Migration: Add login tracking and registration columns to public.profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Function to safely record customer logins
CREATE OR REPLACE FUNCTION public.record_user_login(user_id_param UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET 
    login_count = COALESCE(login_count, 0) + 1,
    last_login_at = now(),
    first_login_at = COALESCE(first_login_at, now())
  WHERE id = user_id_param;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_login(UUID) TO authenticated, service_role;
