-- Ensure 'no-show' enum value exists in booking_status enum if enum is used
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
    WHERE typname = 'booking_status' AND enumlabel = 'no-show'
  ) THEN
    ALTER TYPE public.booking_status ADD VALUE 'no-show';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
