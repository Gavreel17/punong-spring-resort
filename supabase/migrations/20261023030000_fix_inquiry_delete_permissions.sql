-- Migration: Grant DELETE permissions and add DELETE RLS policies for inquiries & inquiry_messages
GRANT DELETE ON public.inquiries TO authenticated;
GRANT DELETE ON public.inquiry_messages TO authenticated;

-- Ensure admin can delete inquiries
DROP POLICY IF EXISTS "Admins can delete inquiries" ON public.inquiries;
CREATE POLICY "Admins can delete inquiries" ON public.inquiries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Ensure admin can delete inquiry_messages
DROP POLICY IF EXISTS "Admins can delete inquiry_messages" ON public.inquiry_messages;
CREATE POLICY "Admins can delete inquiry_messages" ON public.inquiry_messages
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
