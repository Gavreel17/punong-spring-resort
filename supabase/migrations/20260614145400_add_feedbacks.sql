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
