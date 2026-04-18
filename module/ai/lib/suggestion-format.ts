import { SEVERITY_EMOJI } from "../constants/review-emoji";
import type { CodeSuggestion } from "../types/suggestion";
import type { LanguageCode } from "@/shared/types/language";

export const SUGGESTION_SECTION_HINT = {
  en: "> Each item maps 1:1 to an inline suggestion. Apply the actual code change directly from the Files changed tab.",
  ko: ">\u0020\uC544\uB798 \uD56D\uBAA9\uC740 \uAC01\uAC01 inline suggestion\uACFC 1:1\uB85C \uC5F0\uACB0\uB429\uB2C8\uB2E4. \uC2E4\uC81C \uCF54\uB4DC \uBCC0\uACBD\uC740 Files changed \uD0ED\uC5D0\uC11C \uBC14\uB85C \uC801\uC6A9\uD558\uC138\uC694.",
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

  return explanation ? `${header}\n  ${explanation}` : header;
}
