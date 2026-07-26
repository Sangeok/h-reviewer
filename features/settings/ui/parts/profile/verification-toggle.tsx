"use client";

import { Button } from "@/components/ui/button";

interface VerificationToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

const OPTIONS = [
  { value: false, label: "Off" },
  { value: true, label: "On (Verified)" },
] as const;

export default function VerificationToggle({ value, onChange, disabled }: VerificationToggleProps) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <Button
          key={option.label}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
