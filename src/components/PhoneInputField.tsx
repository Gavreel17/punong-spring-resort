import React, { useState, useEffect, useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  validatePhilippineMobileNumber,
  PhoneValidationResult,
  PH_MOBILE_REGEX,
} from "@/lib/phone-validation";
import { AlertCircle } from "lucide-react";

export interface PhoneInputFieldProps {
  id?: string;
  name?: string;
  label?: React.ReactNode;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (result: PhoneValidationResult) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  helperText?: string;
}

export function PhoneInputField({
  id,
  name = "phone",
  label = "Phone",
  required = true,
  value,
  onChange,
  onValidationChange,
  placeholder = "09XXXXXXXXX",
  disabled = false,
  className,
  inputClassName,
  autoFocus = false,
  helperText,
}: PhoneInputFieldProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const [touched, setTouched] = useState(false);
  const [temporaryError, setTemporaryError] = useState<string | null>(null);

  // Compute validation state
  const validation = validatePhilippineMobileNumber(value, { required });

  // Effective error to display
  const activeError =
    temporaryError || (touched || value.length > 0 ? validation.error : null);

  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(validation);
    }
  }, [value, required]);

  // Handle keydown to reject non-numeric characters and immediately display error
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation/editing keys & shortcuts
    if (
      e.key === "Backspace" ||
      e.key === "Delete" ||
      e.key === "Tab" ||
      e.key === "Escape" ||
      e.key === "Enter" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "Home" ||
      e.key === "End" ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return;
    }

    // Check if character is not a digit 0-9
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      setTouched(true);
      setTemporaryError("Only numeric digits are allowed.");
    } else {
      // Clear temporary error when user presses a valid digit
      if (temporaryError === "Only numeric digits are allowed.") {
        setTemporaryError(null);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    const rawVal = e.target.value;

    // Check if non-digits were pasted
    if (/\D/.test(rawVal)) {
      setTemporaryError("Only numeric digits are allowed.");
      // Sanitize to only numeric digits and max 11 digits
      const sanitized = rawVal.replace(/\D/g, "").slice(0, 11);
      onChange(sanitized);
    } else {
      setTemporaryError(null);
      // Strictly max 11 digits
      const limited = rawVal.slice(0, 11);
      onChange(limited);
    }
  };

  const handleBlur = () => {
    setTouched(true);
    // Re-evaluate on blur
    if (temporaryError && !/\D/.test(value)) {
      setTemporaryError(null);
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={inputId} className="flex items-center gap-1">
          {label}
          {required && <span className="text-red-500 font-bold">*</span>}
        </Label>
      )}

      <Input
        id={inputId}
        name={name}
        type="tel"
        inputMode="numeric"
        pattern="09[0-9]{9}"
        maxLength={11}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          "transition-colors",
          inputClassName,
          activeError &&
            "border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500 bg-red-50/20 text-slate-900"
        )}
        aria-invalid={!!activeError}
        aria-describedby={activeError ? `${inputId}-error` : undefined}
      />

      {activeError ? (
        <p
          id={`${inputId}-error`}
          className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5 pt-0.5 animate-fadeIn"
          role="alert"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
          <span>{activeError}</span>
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-slate-500 pt-0.5">{helperText}</p>
      ) : null}
    </div>
  );
}
