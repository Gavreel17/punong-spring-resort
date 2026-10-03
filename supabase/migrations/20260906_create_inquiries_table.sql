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
