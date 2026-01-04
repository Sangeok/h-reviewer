export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
];

export const DEFAULT_LANGUAGE = "en";

export type LanguageCode = "en" | "ko";

export const SECTION_HEADERS = {
  en: {
    walkthrough: "Walkthrough",
    sequenceDiagram: "Sequence Diagram",
    summary: "Summary",
    strengths: "Strengths",
    issues: "Issues",
    suggestions: "Suggestions",
    poem: "Poem",
  },
  ko: {
    walkthrough: "변경 사항 상세",
    sequenceDiagram: "시퀀스 다이어그램",
    summary: "요약",
    strengths: "강점",
    issues: "발견된 문제점",
    suggestions: "개선 제안",
    poem: "마무리 시",
  },
} as const;

/**
 * Type guard to check if a string is a valid language code
 */
export function isValidLanguageCode(code: string): code is LanguageCode {
  return code === "en" || code === "ko";
}

/**
 * Get the language name from a language code
 * @param code - Language code (e.g., "en", "ko")
 * @returns Language name in English (e.g., "English", "Korean")
 */
export function getLanguageName(code: string): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return lang?.name || "English";
}
