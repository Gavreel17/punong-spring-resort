-- Migration: Create System Settings table and RPC functions for Punong Spring Resort
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  resort_name TEXT NOT NULL DEFAULT 'Punong Spring Resort',
  contact_number TEXT NOT NULL DEFAULT '+63 917 123 4567',
  contact_email TEXT NOT NULL DEFAULT 'punongspringresort@gmail.com',
  address TEXT NOT NULL DEFAULT 'Brgy. Guba, Cebu City, Philippines',
  business_hours TEXT NOT NULL DEFAULT '8:00 AM - 6:00 PM (Daily)',
  default_booking_status TEXT NOT NULL DEFAULT 'pending',
  default_payment_status TEXT NOT NULL DEFAULT 'pending',
  theme TEXT NOT NULL DEFAULT 'system',
  logo_url TEXT,
  notify_new_booking BOOLEAN NOT NULL DEFAULT true,
  notify_inquiry BOOLEAN NOT NULL DEFAULT true,
  notify_message BOOLEAN NOT NULL DEFAULT true,
  notify_payment BOOLEAN NOT NULL DEFAULT true,
  notify_cancellation BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view system settings
CREATE POLICY "Allow authenticated to view system settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

-- Allow public / anon to view basic resort details
CREATE POLICY "Allow public to view system settings"
  ON public.system_settings FOR SELECT
  TO anon
  USING (true);

-- Allow admins to update system settings
CREATE POLICY "Allow admins to update system settings"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert system settings
CREATE POLICY "Allow admins to insert system settings"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Default row insert
INSERT INTO public.system_settings (id, resort_name, contact_number, contact_email, address, business_hours)
VALUES ('default', 'Punong Spring Resort', '+63 917 123 4567', 'punongspringresort@gmail.com', 'Brgy. Guba, Cebu City, Philippines', '8:00 AM - 6:00 PM (Daily)')
ON CONFLICT (id) DO NOTHING;

-- RPC function to get system settings safely
CREATE OR REPLACE FUNCTION public.get_system_settings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
BEGIN
  SELECT * INTO v_settings FROM public.system_settings WHERE id = 'default';
  
  IF NOT FOUND THEN
    INSERT INTO public.system_settings (id) VALUES ('default')
    RETURNING * INTO v_settings;
  END IF;

  RETURN to_jsonb(v_settings);
END;
$$;

-- RPC function to save system settings with admin security check
CREATE OR REPLACE FUNCTION public.save_system_settings(
  p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated RECORD;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  INSERT INTO public.system_settings (
    id,
    resort_name,
    contact_number,
    contact_email,
    address,
    business_hours,
    default_booking_status,
    default_payment_status,
    theme,
    logo_url,
    notify_new_booking,
    notify_inquiry,
    notify_message,
    notify_payment,
    notify_cancellation,
    updated_at,
    updated_by
  ) VALUES (
    'default',
    COALESCE(p_settings->>'resort_name', 'Punong Spring Resort'),
    COALESCE(p_settings->>'contact_number', '+63 917 123 4567'),
    COALESCE(p_settings->>'contact_email', 'punongspringresort@gmail.com'),
    COALESCE(p_settings->>'address', 'Brgy. Guba, Cebu City, Philippines'),
    COALESCE(p_settings->>'business_hours', '8:00 AM - 6:00 PM (Daily)'),
    COALESCE(p_settings->>'default_booking_status', 'pending'),
    COALESCE(p_settings->>'default_payment_status', 'pending'),
    COALESCE(p_settings->>'theme', 'system'),
    p_settings->>'logo_url',
    COALESCE((p_settings->>'notify_new_booking')::BOOLEAN, true),
    COALESCE((p_settings->>'notify_inquiry')::BOOLEAN, true),
    COALESCE((p_settings->>'notify_message')::BOOLEAN, true),
    COALESCE((p_settings->>'notify_payment')::BOOLEAN, true),
    COALESCE((p_settings->>'notify_cancellation')::BOOLEAN, true),
    now(),
    v_user_id
  )
  ON CONFLICT (id) DO UPDATE SET
    resort_name = EXCLUDED.resort_name,
    contact_number = EXCLUDED.contact_number,
    contact_email = EXCLUDED.contact_email,
    address = EXCLUDED.address,
    business_hours = EXCLUDED.business_hours,
    default_booking_status = EXCLUDED.default_booking_status,
    default_payment_status = EXCLUDED.default_payment_status,
    theme = EXCLUDED.theme,
    logo_url = EXCLUDED.logo_url,
    notify_new_booking = EXCLUDED.notify_new_booking,
    notify_inquiry = EXCLUDED.notify_inquiry,
    notify_message = EXCLUDED.notify_message,
    notify_payment = EXCLUDED.notify_payment,
    notify_cancellation = EXCLUDED.notify_cancellation,
    updated_at = now(),
    updated_by = v_user_id
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_settings() TO anon;
GRANT EXECUTE ON FUNCTION public.save_system_settings(JSONB) TO authenticated;
