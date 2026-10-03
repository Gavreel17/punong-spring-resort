
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
