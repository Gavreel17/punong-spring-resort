-- ==============================================================================
-- STRICT 11-DIGIT PHILIPPINE MOBILE NUMBER VALIDATION FOR PUNONG SPRING RESORT
-- Run this query in Supabase SQL Editor to enforce strict mobile number rules:
-- 1. Must start with '09'
-- 2. Exactly 11 digits long
-- 3. Only digits 0-9 allowed (no letters, spaces, dashes, or symbols)
-- 4. Rejects direct API bypass attempts on bookings and profiles
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.validate_philippine_mobile_number_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate bookings table (guest_phone is required)
  IF TG_TABLE_NAME = 'bookings' THEN
    IF NEW.guest_phone IS NULL OR trim(NEW.guest_phone) = '' THEN
      RAISE EXCEPTION 'Mobile number is required.';
    END IF;

    IF NEW.guest_phone ~ '[^0-9]' THEN
      RAISE EXCEPTION 'Only numeric digits are allowed.';
    END IF;

    IF NOT (NEW.guest_phone LIKE '09%') THEN
      RAISE EXCEPTION 'Please enter a valid Philippine mobile number starting with 09.';
    END IF;

    IF length(NEW.guest_phone) <> 11 THEN
      RAISE EXCEPTION 'Mobile number must contain exactly 11 digits.';
    END IF;

    IF NEW.guest_phone !~ '^09[0-9]{9}$' THEN
      RAISE EXCEPTION 'Please enter a valid Philippine mobile number starting with 09.';
    END IF;
  END IF;

  -- Validate profiles table (phone is validated whenever present)
  IF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.phone IS NOT NULL AND trim(NEW.phone) <> '' THEN
      IF NEW.phone ~ '[^0-9]' THEN
        RAISE EXCEPTION 'Only numeric digits are allowed.';
      END IF;

      IF NOT (NEW.phone LIKE '09%') THEN
        RAISE EXCEPTION 'Please enter a valid Philippine mobile number starting with 09.';
      END IF;

      IF length(NEW.phone) <> 11 THEN
        RAISE EXCEPTION 'Mobile number must contain exactly 11 digits.';
      END IF;

      IF NEW.phone !~ '^09[0-9]{9}$' THEN
        RAISE EXCEPTION 'Please enter a valid Philippine mobile number starting with 09.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to bookings table
DROP TRIGGER IF EXISTS trg_validate_booking_phone ON public.bookings;
CREATE TRIGGER trg_validate_booking_phone
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_philippine_mobile_number_trigger();

-- Apply trigger to profiles table
DROP TRIGGER IF EXISTS trg_validate_profile_phone ON public.profiles;
CREATE TRIGGER trg_validate_profile_phone
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_philippine_mobile_number_trigger();
