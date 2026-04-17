import type { LanguageCode } from "@/shared/types/language";
import type { CodeSuggestion, StructuredIssue } from "../types";

type GuardTextFeedbackParams = {
  suggestions: CodeSuggestion[];
  issues: StructuredIssue[];
  langCode: LanguageCode;
};

type GuardTextFeedbackResult = {
  keptSuggestions: CodeSuggestion[];
  keptIssues: StructuredIssue[];
  synthesizedIssues: StructuredIssue[];
};

type FeedbackContext = "display" | "processing";
type SuggestionGuardDecision = "keep" | "weak" | "drop";

const ENCODING_KEYWORDS = [
  "encoding",
  "인코딩",
  "mojibake",
  "garbled",
  "깨진 문자",
] as const;

const DISPLAY_CORRUPTION_PHRASES = [
  "잘못 표시",
  "깨져 보임",
  "문자가 깨짐",
  "garbled text",
  "corrupted text",
] as const;

const STYLE_ONLY_PHRASES = [
  "가독성",
  "표기 일관성",
  "copy",
  "user-facing text",
  "문자 표기",
  "레이블",
  "placeholder",
  "alt text",
] as const;

const PROCESSING_CONTEXT_KEYWORDS = [
  "decode",
  "encode",
  "charset",
  "utf-8",
  "utf8",
  "bytes",
  "textdecoder",
  "buffer",
  "escape",
  "unescape",
  "parser",
  "serializer",
  "transcode",
  "data corruption",
  "round-trip",
  "decode mismatch",
  "runtime corruption",
] as const;

const HARD_EVIDENCE_TOKENS = [
  "�",
  "â€",
  "â€“",
  "â€”",
  "Ã—",
  "Ã©",
  "Â·",
  "Ã±",
] as const;

const TYPOGRAPHY_TOKENS = [
  "×",
  "–",
  "—",
  "“",
  "”",
  "‘",
  "’",
  "…",
] as const;

const RAW_ESCAPE_LITERAL_PATTERN = /\\(?:x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|[0-7]{3})/;
const INLINE_CODE_PATTERN = /`([^`\n]{1,80})`/g;
const QUOTED_TEXT_PATTERN = /["']([^"'\n]{1,80})["']/g;
const STRING_LITERAL_PATTERN = /(["'`])([^"'`\n]{1,80})\1/g;
const STRING_LITERAL_TEST_PATTERN = /(["'`])([^"'`\n]{1,80})\1/;

const SYNTHESIZED_ISSUE_COPY: Record<
  LanguageCode,
  {
    title: string;
    buildBody: (examples: string[]) => string;
    recommendation: string;
  }
> = {
  ko: {
    title: "문자열 표기 일관성 점검 필요",
    buildBody: (examples) => {
      if (examples.length === 0) {
        return "현재 증거만으로는 이 파일의 사용자 노출 문자열을 인코딩 깨짐으로 단정하기 어렵습니다. 문자열 표기를 정책 기준으로 점검하세요.";
      }

      const joinedExamples = examples.map((example) => `\`${example}\``).join(", ");
      return `${joinedExamples} 같은 문자열은 현재 증거만으로는 인코딩 깨짐이라 보기 어렵습니다. 이 파일의 사용자 노출 문자열 표기를 정책 기준으로 점검하세요.`;
    },
    recommendation: "이 파일의 사용자 노출 문자열 표기를 프로젝트 정책 기준으로 점검하세요.",
  },
  en: {
    title: "Text notation consistency should be reviewed",
    buildBody: (examples) => {
      if (examples.length === 0) {
        return "The current evidence is not strong enough to classify the user-facing text in this file as broken encoding. Review the text notation against the project style policy.";
      }

      const joinedExamples = examples.map((example) => `\`${example}\``).join(", ");
      return `${joinedExamples} do not provide strong enough evidence to classify this file as having broken encoding. Review the user-facing text notation against the project style policy.`;
    },
    recommendation: "Review the file's user-facing text notation against the project style policy.",
  },
};

export function guardTextFeedback(
  params: GuardTextFeedbackParams,
): GuardTextFeedbackResult {
  const { suggestions, issues, langCode } = params;
  const weakSuggestionExamplesByFile = new Map<string, string[]>();

  const keptSuggestions = suggestions.filter((suggestion) => {
    if (!isSuggestionEncodingCandidate(suggestion)) {
      return true;
    }

    const context = classifyFeedbackContext({
      text: suggestion.explanation,
      before: suggestion.before,
    });

    if (context === "processing") {
      return true;
    }

    const decision = decideSuggestionGuardAction(suggestion.before);
    if (decision === "keep") {
      return true;
    }

    if (decision === "weak") {
      const exampleToken = extractExampleToken(suggestion);
      if (exampleToken) {
        appendWeakExample(weakSuggestionExamplesByFile, suggestion.file, exampleToken);
      }
    }

    return false;
  });

  const keptIssues = issues.filter((issue) => {
    if (!isIssueEncodingCandidate(issue)) {
      return true;
    }

    const context = classifyFeedbackContext({
      text: collectIssueText(issue),
    });

    return context === "processing";
  });

  const synthesizedIssues = Array.from(weakSuggestionExamplesByFile.entries()).map(
    ([file, examples]) => buildSynthesizedIssue({ file, examples, langCode }),
  );

  return {
    keptSuggestions,
    keptIssues,
    synthesizedIssues,
  };
}

function isSuggestionEncodingCandidate(suggestion: CodeSuggestion): boolean {
  return hasCandidateSignal(suggestion.explanation);
}

function isIssueEncodingCandidate(issue: StructuredIssue): boolean {
  const primaryText = `${issue.title}\n${issue.body}`.trim();
  const secondaryText = `${issue.impact}\n${issue.recommendation}`.trim();

  if (hasCandidateSignal(primaryText)) {
    return true;
  }

  if (!secondaryText || !hasCandidateSignal(secondaryText)) {
    return false;
  }

  return hasDisplayOrProcessingContext(primaryText);
}

function hasCandidateSignal(text: string): boolean {
  return hasEncodingKeyword(text) || hasHardEvidenceToken(text) || hasDisplayCorruptionPhrase(text);
}

function classifyFeedbackContext(params: {
  text: string;
  before?: string;
}): FeedbackContext {
  const { text, before = "" } = params;
  const normalizedText = text.toLowerCase();

  if (hasAnySubstring(normalizedText, PROCESSING_CONTEXT_KEYWORDS)) {
    return "processing";
  }

  if (
    hasDisplayOrProcessingContext(text) ||
    looksLikeTextLiteral(before) ||
    hasHardEvidenceToken(before) ||
    hasTypographyToken(before) ||
    hasRawEscapeLiteral(before)
  ) {
    return "display";
  }

  return "display";
}

function hasDisplayOrProcessingContext(text: string): boolean {
  return hasDisplayContextSignal(text) || hasProcessingContextSignal(text);
}

function hasDisplayContextSignal(text: string): boolean {
  return hasDisplayCorruptionPhrase(text) || hasStyleOnlyPhrase(text);
}

function hasProcessingContextSignal(text: string): boolean {
  return hasAnySubstring(text.toLowerCase(), PROCESSING_CONTEXT_KEYWORDS);
}

function decideSuggestionGuardAction(before: string): SuggestionGuardDecision {
  if (hasHardEvidenceToken(before)) {
    return "keep";
  }

  if (hasRawEscapeLiteral(before) || hasTypographyToken(before)) {
    return "weak";
  }

  return "drop";
}

function buildSynthesizedIssue(params: {
  file: string;
  examples: string[];
  langCode: LanguageCode;
}): StructuredIssue {
  const { file, examples, langCode } = params;
  const localizedCopy = SYNTHESIZED_ISSUE_COPY[langCode];
  const uniqueExamples = dedupeExamples(examples).slice(0, 3);

  return {
    file,
    line: null,
    title: localizedCopy.title,
    body: localizedCopy.buildBody(uniqueExamples),
    impact: "",
    recommendation: localizedCopy.recommendation,
    severity: "INFO",
    category: "general",
  };
}

function collectIssueText(issue: StructuredIssue): string {
  return [issue.title, issue.body, issue.impact, issue.recommendation]
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

function extractExampleToken(suggestion: CodeSuggestion): string | null {
  const preferredBeforeToken = extractPreferredTextToken(suggestion.before);
  if (preferredBeforeToken) {
    return preferredBeforeToken;
  }

  const preferredExplanationToken = extractPreferredTextToken(suggestion.explanation);
  if (preferredExplanationToken) {
    return preferredExplanationToken;
  }

  const compactBefore = suggestion.before.replace(/\s+/g, " ").trim();
  if (!compactBefore) {
    return null;
  }

  return compactBefore.length <= 60
    ? compactBefore
    : `${compactBefore.slice(0, 57)}...`;
}

function extractPreferredTextToken(text: string): string | null {
  const literalTokens = extractPatternMatches(text, STRING_LITERAL_PATTERN);
  const inlineCodeTokens = extractPatternMatches(text, INLINE_CODE_PATTERN);
  const quotedTextTokens = extractPatternMatches(text, QUOTED_TEXT_PATTERN);

  const prioritizedTokens = [...literalTokens, ...inlineCodeTokens, ...quotedTextTokens]
    .map((token) => token.replace(/\s+/g, " ").trim())
    .filter((token) => token.length > 0)
    .filter((token) => hasTypographyToken(token) || hasRawEscapeLiteral(token) || !isPureAscii(token));

  return prioritizedTokens[0] ?? null;
}

function extractPatternMatches(text: string, pattern: RegExp): string[] {
  const matches = Array.from(text.matchAll(pattern), (match) => match[1]?.trim() ?? "");
  return matches.filter((match) => match.length > 0);
}

function appendWeakExample(
  examplesByFile: Map<string, string[]>,
  file: string,
  example: string,
): void {
  const existingExamples = examplesByFile.get(file) ?? [];
  if (existingExamples.includes(example)) {
    return;
  }

  examplesByFile.set(file, [...existingExamples, example]);
}

function dedupeExamples(examples: string[]): string[] {
  return Array.from(new Set(examples));
}

function hasEncodingKeyword(text: string): boolean {
  return hasAnySubstring(text.toLowerCase(), ENCODING_KEYWORDS);
}

function hasDisplayCorruptionPhrase(text: string): boolean {
  return hasAnySubstring(text.toLowerCase(), DISPLAY_CORRUPTION_PHRASES);
}

function hasStyleOnlyPhrase(text: string): boolean {
  return hasAnySubstring(text.toLowerCase(), STYLE_ONLY_PHRASES);
}

function hasHardEvidenceToken(text: string): boolean {
  return HARD_EVIDENCE_TOKENS.some((token) => text.includes(token));
}

function hasTypographyToken(text: string): boolean {
  return TYPOGRAPHY_TOKENS.some((token) => text.includes(token));
}

function hasRawEscapeLiteral(text: string): boolean {
  return RAW_ESCAPE_LITERAL_PATTERN.test(text);
}

function isPureAscii(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text);
}

function looksLikeTextLiteral(text: string): boolean {
  return STRING_LITERAL_TEST_PATTERN.test(text);
}

function hasAnySubstring(text: string, values: readonly string[]): boolean {
  return values.some((value) => text.includes(value.toLowerCase()));
}
