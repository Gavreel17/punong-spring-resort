-- 1. Update status constraint on public.inquiries to include 'waiting_reply'
ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_status_check;
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_status_check CHECK (status IN ('unread', 'read', 'replied', 'waiting_reply'));

-- 2. Allow authenticated customers to view and update their own inquiries
DROP POLICY IF EXISTS "Customers can view own inquiries" ON public.inquiries;
CREATE POLICY "Customers can view own inquiries" ON public.inquiries
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Customers can update own inquiries" ON public.inquiries;
CREATE POLICY "Customers can update own inquiries" ON public.inquiries
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- 3. Create inquiry_messages table for full two-way threaded conversations
CREATE TABLE IF NOT EXISTS public.inquiry_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.inquiry_messages ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for inquiry_messages
-- Admins have full access
DROP POLICY IF EXISTS "Admins can manage all inquiry_messages" ON public.inquiry_messages;
CREATE POLICY "Admins can manage all inquiry_messages" ON public.inquiry_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Customers can view messages in their own inquiries
DROP POLICY IF EXISTS "Customers can view messages in own inquiries" ON public.inquiry_messages;
CREATE POLICY "Customers can view messages in own inquiries" ON public.inquiry_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_messages.inquiry_id
      AND (i.customer_id = auth.uid() OR i.email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Customers can insert messages into their own inquiries
DROP POLICY IF EXISTS "Customers can insert messages into own inquiries" ON public.inquiry_messages;
CREATE POLICY "Customers can insert messages into own inquiries" ON public.inquiry_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_role = 'customer' AND
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_messages.inquiry_id
      AND (i.customer_id = auth.uid() OR i.email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Customers can update read_at on messages in their own inquiries
DROP POLICY IF EXISTS "Customers can mark messages read in own inquiries" ON public.inquiry_messages;
CREATE POLICY "Customers can mark messages read in own inquiries" ON public.inquiry_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_messages.inquiry_id
      AND (i.customer_id = auth.uid() OR i.email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Grants
GRANT ALL ON public.inquiry_messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.inquiry_messages TO authenticated;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inquiry_messages_inquiry_id ON public.inquiry_messages (inquiry_id, created_at ASC);

-- 5. Backfill existing inquiries into inquiry_messages thread format
INSERT INTO public.inquiry_messages (inquiry_id, sender_id, sender_role, message, created_at, read_at)
SELECT id, customer_id, 'customer', message, created_at, created_at
FROM public.inquiries
WHERE id NOT IN (SELECT DISTINCT inquiry_id FROM public.inquiry_messages WHERE sender_role = 'customer');

INSERT INTO public.inquiry_messages (inquiry_id, sender_id, sender_role, message, created_at, read_at)
SELECT id, NULL, 'admin', admin_reply, COALESCE(replied_at, updated_at, now()), replied_at
FROM public.inquiries
WHERE admin_reply IS NOT NULL AND admin_reply != ''
AND id NOT IN (SELECT DISTINCT inquiry_id FROM public.inquiry_messages WHERE sender_role = 'admin');
