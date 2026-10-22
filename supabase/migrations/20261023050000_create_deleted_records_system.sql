-- Migration: Create deleted_records table and enhance soft deletion for Punong Spring Resort
CREATE TABLE IF NOT EXISTS public.deleted_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL, -- 'booking', 'room', 'customer', 'inquiry', 'feedback'
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  amount NUMERIC(10,2),
  dates TEXT,
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_by_name TEXT,
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Ensure soft-delete columns on core tables
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;

-- Admins can view, insert, update, and delete in deleted_records
DROP POLICY IF EXISTS "Admins can manage deleted_records" ON public.deleted_records;
CREATE POLICY "Admins can manage deleted_records" ON public.deleted_records
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Grants
GRANT ALL ON public.deleted_records TO authenticated;
GRANT ALL ON public.deleted_records TO service_role;

-- Indexes for optimal querying and filtering
CREATE INDEX IF NOT EXISTS idx_deleted_records_type ON public.deleted_records (record_type);
CREATE INDEX IF NOT EXISTS idx_deleted_records_record_id ON public.deleted_records (record_id);
CREATE INDEX IF NOT EXISTS idx_deleted_records_deleted_at ON public.deleted_records (deleted_at DESC);
