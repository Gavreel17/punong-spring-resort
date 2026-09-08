ALTER TABLE public.rooms ALTER COLUMN capacity TYPE text USING capacity::text;
