-- Fix RLS policies to use auth.jwt() ->> 'email' instead of querying auth.users table
-- This prevents "permission denied for table users" errors

-- Drop existing policies that queried auth.users
DROP POLICY IF EXISTS "Customers can view own inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Customers can update own inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Customers can view messages in own inquiries" ON public.inquiry_messages;
DROP POLICY IF EXISTS "Customers can insert messages into own inquiries" ON public.inquiry_messages;
DROP POLICY IF EXISTS "Customers can mark messages read in own inquiries" ON public.inquiry_messages;
DROP POLICY IF EXISTS "Users can view relevant inquiry_messages" ON public.inquiry_messages;
DROP POLICY IF EXISTS "Anyone can insert customer message" ON public.inquiry_messages;
DROP POLICY IF EXISTS "Users can mark messages read" ON public.inquiry_messages;

-- 1. Inquiries SELECT policy for authenticated customers & admins
CREATE POLICY "Customers can view own inquiries" ON public.inquiries
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid() 
    OR ((auth.jwt() ->> 'email') IS NOT NULL AND email = (auth.jwt() ->> 'email'))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 2. Inquiries UPDATE policy
CREATE POLICY "Customers can update own inquiries" ON public.inquiries
  FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid() 
    OR ((auth.jwt() ->> 'email') IS NOT NULL AND email = (auth.jwt() ->> 'email'))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 3. Inquiry messages SELECT policy
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

-- 4. Inquiry messages INSERT policy (allows anon and authenticated to insert customer messages)
CREATE POLICY "Anyone can insert customer message" ON public.inquiry_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    sender_role = 'customer'
    OR public.has_role(auth.uid(), 'admin')
  );

-- 5. Inquiry messages UPDATE policy (marking messages read)
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

-- 6. Ensure anon has INSERT on inquiry_messages
GRANT INSERT ON public.inquiry_messages TO anon;
