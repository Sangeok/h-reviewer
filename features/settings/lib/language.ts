import { DEFAULT_LANGUAGE, LANGUAGE_BY_CODE, type LanguageCode } from "../constants";

/**
 * Type guard to check if a string is a valid language code
 */
export function isValidLanguageCode(code: string): code is LanguageCode {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_BY_CODE, code);
}

/**
 * Get the language name from a language code
 * @param code - Language code (e.g., "en", "ko")
 * @returns Language name in English (e.g., "English", "Korean")
 */
export function getLanguageName(code: string): string {
  if (isValidLanguageCode(code)) {
    return LANGUAGE_BY_CODE[code].name;
  }
  return LANGUAGE_BY_CODE[DEFAULT_LANGUAGE].name;
}
