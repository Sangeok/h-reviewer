"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "../../constants";

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
  disabled?: boolean;
}

export default function LanguageSelector({ value, onChange, disabled }: LanguageSelectorProps) {
  return (
    <Select value={value} onValueChange={(val) => onChange(val as LanguageCode)} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.nativeName} ({lang.name})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
