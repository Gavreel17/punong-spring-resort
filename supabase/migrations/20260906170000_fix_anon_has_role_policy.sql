-- Separate inquiry_messages INSERT policies so anon users never evaluate has_role()

DROP POLICY IF EXISTS "Anyone can insert customer message" ON public.inquiry_messages;
DROP POLICY IF EXISTS "Customers can insert customer messages" ON public.inquiry_messages;
DROP POLICY IF EXISTS "Admins can insert admin messages" ON public.inquiry_messages;

-- 1. Anyone (guests and logged-in customers) can insert customer messages
CREATE POLICY "Customers can insert customer messages" ON public.inquiry_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (sender_role = 'customer');

-- 2. Authenticated admins can insert admin replies
CREATE POLICY "Admins can insert admin messages" ON public.inquiry_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
