/**
 * Strict Philippine Mobile Number Validation
 *
 * Rules:
 * 1. Must start with '09'
 * 2. Exactly 11 digits long
 * 3. Numeric digits 0-9 only
 * 4. Preserves leading zero as string
 * 5. Standard format: /^09[0-9]{9}$/
 */

export const PH_MOBILE_REGEX = /^09[0-9]{9}$/;

export interface PhoneValidationResult {
  isValid: boolean;
  error: string | null;
}

export function validatePhilippineMobileNumber(
  value: string | null | undefined,
  options?: { required?: boolean }
): PhoneValidationResult {
  const isRequired = options?.required ?? true;
  const raw = (value ?? "").toString();

  // 1. Check if empty
  if (!raw.trim()) {
    if (isRequired) {
      return { isValid: false, error: "Mobile number is required." };
    }
    return { isValid: true, error: null };
  }

  // 2. Check for non-numeric characters (letters, symbols, spaces, dashes)
  if (/\D/.test(raw)) {
    return { isValid: false, error: "Only numeric digits are allowed." };
  }

  // 3. Check if starts with '09'
  if (!raw.startsWith("09")) {
    return {
      isValid: false,
      error: "Please enter a valid Philippine mobile number starting with 09.",
    };
  }

  // 4. Check exact 11 digits length
  if (raw.length !== 11) {
    return {
      isValid: false,
      error: "Mobile number must contain exactly 11 digits.",
    };
  }

  // 5. Final strict regex test
  if (!PH_MOBILE_REGEX.test(raw)) {
    return {
      isValid: false,
      error: "Please enter a valid Philippine mobile number starting with 09.",
    };
  }

  return { isValid: true, error: null };
}

export function isValidPhilippineMobileNumber(
  value: string | null | undefined,
  options?: { required?: boolean }
): boolean {
  return validatePhilippineMobileNumber(value, options).isValid;
}
