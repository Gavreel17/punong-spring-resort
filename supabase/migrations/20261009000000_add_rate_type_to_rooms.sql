-- Add rate_type to public.rooms table
-- Valid values: 'nightly', 'day'
-- Default value: 'nightly' (for backwards compatibility with existing accommodations)

ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'nightly';

-- Ensure backward compatibility: any existing records with NULL rate_type default to 'nightly'
UPDATE public.rooms 
SET rate_type = 'nightly' 
WHERE rate_type IS NULL;

-- Add check constraint for valid rate types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_rate_type_check'
  ) THEN
    ALTER TABLE public.rooms 
    ADD CONSTRAINT rooms_rate_type_check 
    CHECK (rate_type IN ('nightly', 'day'));
  END IF;
END $$;
