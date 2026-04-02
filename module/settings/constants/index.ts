import type { LanguageCode } from "@/shared/types/language";
export type { LanguageCode };

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

export const SETTINGS_QUERY_KEYS = {
  USER_PROFILE: ["user-profile"],
  CONNECTED_REPOSITORIES: ["connected-repositories"],
} as const;

export const PROFILE_STALE_TIME_MS = 1000 * 60 * 5;
export const REPOSITORIES_STALE_TIME_MS = 1000 * 60 * 2;
