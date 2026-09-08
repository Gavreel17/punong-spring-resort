-- Add 'unpaid' and 'refund_pending' to payment_status enum
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'unpaid';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'refund_pending';
