import { SEVERITY_EMOJI } from "../constants/review-emoji";
import type { CodeSuggestion } from "../types/suggestion";
import type { LanguageCode } from "@/shared/types/language";

export const SUGGESTION_SECTION_HINT = {
  en: "> Every accepted suggestion is preserved here, including its replacement code. Native inline suggestions are an optional convenience.",
  ko: "> 채택된 모든 제안은 replacement 코드와 함께 여기에 보존됩니다. native inline suggestion은 선택적 편의 기능입니다.",
} as const satisfies Record<LanguageCode, string>;

export function normalizeSuggestionExplanation(explanation: string): string {
  return explanation
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function formatSuggestionLocation(suggestion: CodeSuggestion): string {
  const hasValidLine = Number.isFinite(suggestion.line) && suggestion.line > 0;
  if (!hasValidLine) return suggestion.file;

  const beforeLineCount = suggestion.before.split("\n").length;
  const endLine = suggestion.line + beforeLineCount - 1;
  return beforeLineCount > 1
    ? `${suggestion.file}:L${suggestion.line}-L${endLine}`
    : `${suggestion.file}:L${suggestion.line}`;
}

export function formatSuggestionSummaryItem(suggestion: CodeSuggestion): string {
  const header = `### ${SEVERITY_EMOJI[suggestion.severity]} ${suggestion.severity} · \`${formatSuggestionLocation(suggestion)}\``;
  const explanation = normalizeSuggestionExplanation(suggestion.explanation);
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(suggestion.after.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  const replacement = `${fence}\n${suggestion.after}\n${fence}`;

  return [header, explanation, replacement].filter(Boolean).join("\n\n");
}
