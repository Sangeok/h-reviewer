"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type LanguageCode } from "../../constants";

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
  disabled?: boolean;
}

export default function LanguageSelector({ value, onChange, disabled }: LanguageSelectorProps) {
  const fallbackLanguage = SUPPORTED_LANGUAGES.find((lang) => lang.code === DEFAULT_LANGUAGE) ?? SUPPORTED_LANGUAGES[0];
  const selectedLanguage = SUPPORTED_LANGUAGES.find((lang) => lang.code === value) ?? fallbackLanguage;

  return (
    <Select value={selectedLanguage.code} onValueChange={(val) => onChange(val as LanguageCode)} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Select language">
          {selectedLanguage ? `${selectedLanguage.nativeName} (${selectedLanguage.name})` : undefined}
        </SelectValue>
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
