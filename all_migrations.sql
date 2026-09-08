
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');
CREATE TYPE public.booking_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'completed');
CREATE TYPE public.payment_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE public.room_type AS ENUM ('room', 'cottage', 'villa');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fullname TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Rooms
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.room_type NOT NULL DEFAULT 'room',
  description TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  capacity INT NOT NULL CHECK (capacity > 0),
  image_url TEXT,
  amenities TEXT[] DEFAULT '{}',
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Bookings
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests INT NOT NULL CHECK (guests > 0),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  status public.booking_status NOT NULL DEFAULT 'pending',
  special_requests TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.bookings (room_id, check_in, check_out);
CREATE INDEX ON public.bookings (user_id);

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  receipt_url TEXT,
  status public.payment_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- profiles
CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- user_roles
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- rooms (public read; admin write)
CREATE POLICY "anyone views rooms" ON public.rooms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage rooms ins" ON public.rooms FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage rooms upd" ON public.rooms FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage rooms del" ON public.rooms FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- bookings
CREATE POLICY "view own bookings" ON public.bookings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "create own bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "delete bookings" ON public.bookings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- payments
CREATE POLICY "view own payments" ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "create own payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "update payments" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to create profile + assign default customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, fullname, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'fullname', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rooms_updated BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Storage policies for receipts bucket (users upload to their own folder)
CREATE POLICY "users upload own receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users view own receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "admins manage receipts" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'receipts' AND public.has_role(auth.uid(), 'admin'));
ALTER TABLE "public"."rooms"
ADD COLUMN "status" TEXT DEFAULT 'available',
ADD COLUMN "maintenance_start" DATE,
ADD COLUMN "maintenance_end" DATE;

ALTER TABLE "public"."bookings"
ADD COLUMN "booking_status" TEXT,
ADD COLUMN "reservation_color" TEXT;
-- Feedbacks table
CREATE TABLE public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id)
);

GRANT SELECT, INSERT ON public.feedbacks TO authenticated;
GRANT SELECT ON public.feedbacks TO anon;
GRANT ALL ON public.feedbacks TO service_role;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "view approved feedbacks" ON public.feedbacks FOR SELECT TO anon, authenticated
  USING (is_approved = true OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "create own feedbacks" ON public.feedbacks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM public.bookings b 
    WHERE b.id = booking_id AND b.user_id = auth.uid() AND b.status = 'completed'
  ));

CREATE POLICY "admin manage feedbacks upd" ON public.feedbacks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin manage feedbacks del" ON public.feedbacks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_feedbacks_updated BEFORE UPDATE ON public.feedbacks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payment Audit Logs
CREATE TABLE public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_name TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payment_audit_logs TO authenticated;
GRANT ALL ON public.payment_audit_logs TO service_role;
);
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Bookings
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests INT NOT NULL CHECK (guests > 0),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  status public.booking_status NOT NULL DEFAULT 'pending',
  special_requests TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.bookings (room_id, check_in, check_out);
CREATE INDEX ON public.bookings (user_id);

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  receipt_url TEXT,
  status public.payment_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- profiles
CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- user_roles
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- rooms (public read; admin write)
CREATE POLICY "anyone views rooms" ON public.rooms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage rooms ins" ON public.rooms FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage rooms upd" ON public.rooms FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage rooms del" ON public.rooms FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- bookings
CREATE POLICY "view own bookings" ON public.bookings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "create own bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "delete bookings" ON public.bookings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- payments
CREATE POLICY "view own payments" ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "create own payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "update payments" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to create profile + assign default customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, fullname, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'fullname', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rooms_updated BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Storage policies for receipts bucket (users upload to their own folder)
CREATE POLICY "users upload own receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users view own receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "admins manage receipts" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'receipts' AND public.has_role(auth.uid(), 'admin'));
ALTER TABLE "public"."rooms"
ADD COLUMN "status" TEXT DEFAULT 'available',
ADD COLUMN "maintenance_start" DATE,
ADD COLUMN "maintenance_end" DATE;

ALTER TABLE "public"."bookings"
ADD COLUMN "booking_status" TEXT,
ADD COLUMN "reservation_color" TEXT;
-- Feedbacks table
CREATE TABLE public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id)
);

GRANT SELECT, INSERT ON public.feedbacks TO authenticated;
GRANT SELECT ON public.feedbacks TO anon;
GRANT ALL ON public.feedbacks TO service_role;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "view approved feedbacks" ON public.feedbacks FOR SELECT TO anon, authenticated
  USING (is_approved = true OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "create own feedbacks" ON public.feedbacks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM public.bookings b 
    WHERE b.id = booking_id AND b.user_id = auth.uid() AND b.status = 'completed'
  ));

CREATE POLICY "admin manage feedbacks upd" ON public.feedbacks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin manage feedbacks del" ON public.feedbacks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_feedbacks_updated BEFORE UPDATE ON public.feedbacks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payment Audit Logs
CREATE TABLE public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_name TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payment_audit_logs TO authenticated;
GRANT ALL ON public.payment_audit_logs TO service_role;
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view audit logs" ON public.payment_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins insert audit logs" ON public.payment_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

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

-- Create inquiries table
CREATE TABLE IF NOT EXISTS public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Anyone (guests or logged-in users) can submit an inquiry via Contact Us
CREATE POLICY "Anyone can submit inquiry" ON public.inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 2. Admins can view, update, and delete inquiries
CREATE POLICY "Admins can manage inquiries" ON public.inquiries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Grants
GRANT ALL ON public.inquiries TO service_role;
GRANT INSERT ON public.inquiries TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.inquiries TO authenticated;

CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries (status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.inquiries (created_at DESC);

-- Update status constraint on public.inquiries to include 'waiting_reply'
ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_status_check;
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_status_check CHECK (status IN ('unread', 'read', 'replied', 'waiting_reply'));

-- Allow authenticated customers to view and update their own inquiries
DROP POLICY IF EXISTS "Customers can view own inquiries" ON public.inquiries;
CREATE POLICY "Customers can view own inquiries" ON public.inquiries
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid() 
    OR ((auth.jwt() ->> 'email') IS NOT NULL AND email = (auth.jwt() ->> 'email'))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Customers can update own inquiries" ON public.inquiries;
CREATE POLICY "Customers can update own inquiries" ON public.inquiries
  FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid() 
    OR ((auth.jwt() ->> 'email') IS NOT NULL AND email = (auth.jwt() ->> 'email'))
    OR public.has_role(auth.uid(), 'admin')
  );

-- Create inquiry_messages table for full two-way threaded conversations
CREATE TABLE IF NOT EXISTS public.inquiry_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

ALTER TABLE public.inquiry_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all inquiry_messages" ON public.inquiry_messages;
CREATE POLICY "Admins can manage all inquiry_messages" ON public.inquiry_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view relevant inquiry_messages" ON public.inquiry_messages;
CREATE POLICY "Users can view relevant inquiry_messages" ON public.inquiry_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_messages.inquiry_id
      AND (
        i.customer_id = auth.uid() 
        OR ((auth.jwt() ->> 'email') IS NOT NULL AND i.email = (auth.jwt() ->> 'email'))
      )
    )
  );

DROP POLICY IF EXISTS "Anyone can insert customer message" ON public.inquiry_messages;
CREATE POLICY "Anyone can insert customer message" ON public.inquiry_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    sender_role = 'customer'
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Users can mark messages read" ON public.inquiry_messages;
CREATE POLICY "Users can mark messages read" ON public.inquiry_messages
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_messages.inquiry_id
      AND (
        i.customer_id = auth.uid() 
        OR ((auth.jwt() ->> 'email') IS NOT NULL AND i.email = (auth.jwt() ->> 'email'))
      )
    )
  );

GRANT ALL ON public.inquiry_messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.inquiry_messages TO authenticated;
GRANT INSERT ON public.inquiry_messages TO anon;

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_inquiry_id ON public.inquiry_messages (inquiry_id, created_at ASC);


