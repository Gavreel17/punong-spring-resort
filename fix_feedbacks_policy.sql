DROP POLICY IF EXISTS "view approved feedbacks" ON public.feedbacks;

CREATE POLICY "anon view approved feedbacks" ON public.feedbacks FOR SELECT TO anon
  USING (is_approved = true);

CREATE POLICY "auth view feedbacks" ON public.feedbacks FOR SELECT TO authenticated
  USING (is_approved = true OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
