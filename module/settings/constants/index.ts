export type LanguageCode = "en" | "ko";

export interface SupportedLanguage {
  code: LanguageCode;
  name: string;
  nativeName: string;
}

export const LANGUAGE_BY_CODE: Record<LanguageCode, SupportedLanguage> = {
  en: { code: "en", name: "English", nativeName: "English" },
  ko: { code: "ko", name: "Korean", nativeName: "한국어" },
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = Object.values(LANGUAGE_BY_CODE);

export const DEFAULT_LANGUAGE: LanguageCode = "en";

/**
 * Type guard to check if a string is a valid language code
 */
export function isValidLanguageCode(code: string): code is LanguageCode {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_BY_CODE, code);
}

/**
 * Normalize arbitrary language input to a supported language code.
 */
export function normalizeLanguageCode(code: string | null | undefined): LanguageCode | null {
  if (typeof code !== "string") {
    return null;
  }

  const normalized = code.trim().toLowerCase();
  return isValidLanguageCode(normalized) ? normalized : null;
}

/**
 * Get the language name from a language code
 * @param code - Language code (e.g., "en", "ko")
 * @returns Language name in English (e.g., "English", "Korean")
 */
export function getLanguageName(code: string): string {
  const normalizedCode = normalizeLanguageCode(code);
  if (!normalizedCode) {
    return LANGUAGE_BY_CODE[DEFAULT_LANGUAGE].name;
  }

  return LANGUAGE_BY_CODE[normalizedCode].name;
}
