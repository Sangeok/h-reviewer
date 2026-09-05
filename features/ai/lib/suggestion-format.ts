import { SEVERITY_EMOJI } from "../constants/review-emoji";
import type { CodeSuggestion } from "../types/suggestion";
import type { LanguageCode } from "@/shared/types/language";

export const SUGGESTION_SECTION_HINT = {
  en: "> Each item includes the exact replacement. An inline suggestion may also be available in Files changed.",
  ko: "> 아래 항목마다 실제 교체 코드가 포함됩니다. Files changed 탭에도 inline suggestion이 제공될 수 있습니다.",
} as const satisfies Record<LanguageCode, string>;

export function normalizeSuggestionExplanation(explanation: string): string {
  return explanation
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function formatSuggestionLocation(suggestion: CodeSuggestion): string {
  const hasValidLine = Number.isFinite(suggestion.line) && suggestion.line > 0;
  if (!hasValidLine) {
    return suggestion.file;
  }

  const beforeLineCount = suggestion.before.split("\n").length;
  const endLine = suggestion.line + beforeLineCount - 1;

  return beforeLineCount > 1
    ? `${suggestion.file}:L${suggestion.line}-L${endLine}`
    : `${suggestion.file}:L${suggestion.line}`;
}

export function formatSuggestionSummaryItem(suggestion: CodeSuggestion): string {
  const header = `- ${SEVERITY_EMOJI[suggestion.severity]} ${suggestion.severity} \u00b7 \`${formatSuggestionLocation(suggestion)}\``;
  const explanation = normalizeSuggestionExplanation(suggestion.explanation);
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(suggestion.after.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  const replacement = `${fence}\n${suggestion.after}\n${fence}`;

  return [header, explanation ? `  ${explanation}` : null, replacement]
    .filter((line): line is string => line !== null)
    .join("\n\n");
}
