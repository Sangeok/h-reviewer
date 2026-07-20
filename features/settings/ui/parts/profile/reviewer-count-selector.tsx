"use client";

import { Button } from "@/components/ui/button";

interface ReviewerCountSelectorProps {
  value: 1 | 2;
  onChange: (value: 1 | 2) => void;
  disabled?: boolean;
}

const OPTIONS = [
  { value: 1, label: "1 Reviewer" },
  { value: 2, label: "2 Reviewers (Verified)" },
] as const;

export default function ReviewerCountSelector({ value, onChange, disabled }: ReviewerCountSelectorProps) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
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
