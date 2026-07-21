import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { VERIFIER_MODEL_ID } from "../constants";
import { verificationVerdictSchema } from "./review-schema";
import type { StructuredReviewOutput, VerificationVerdict } from "./review-schema";
import type { CodeSuggestion, StructuredIssue } from "../types";
import type { LanguageCode } from "@/shared/types/language";
import { VERIFICATION_LABELS } from "@/shared/constants";

export interface VerdictEntry {
  verdict: VerificationVerdict;
  reason: string;
}

export interface VerificationResult {
  status: "verified" | "skipped";
  /** 입력 issues 배열과 index 정렬 */
  issueVerdicts: VerdictEntry[];
  /** 입력 suggestions 배열과 index 정렬 */
  suggestionVerdicts: VerdictEntry[];
}

export interface AppliedVerification {
  keptOutput: StructuredReviewOutput;
  /** keptOutput.issues와 index 정렬 (CONFIRMED | UNCERTAIN만 포함) */
  keptIssueVerdicts: VerdictEntry[];
  /** keptOutput.suggestions와 index 정렬 */
  keptSuggestionVerdicts: VerdictEntry[];
  rejectedIssues: (StructuredIssue & { reason: string })[];
  rejectedSuggestions: (CodeSuggestion & { reason: string })[];
}

// LLM 출력용 스키마 — index 기반이라 배열 길이 불일치에 관대하다.
const verdictEntryOutputSchema = z.object({
  index: z.number().int().min(0).describe("Index of the finding in the numbered list"),
  verdict: verificationVerdictSchema.describe(
    "REJECTED only when the diff itself provides concrete evidence the finding is wrong. " +
    "UNCERTAIN when plausible but not confirmable from the diff alone. " +
    "CONFIRMED when the diff clearly supports the finding."
  ),
  reason: z.string().describe("1-2 sentence justification citing the diff"),
});

const verifierOutputSchema = z.object({
  issueVerdicts: z.array(verdictEntryOutputSchema),
  suggestionVerdicts: z.array(verdictEntryOutputSchema),
});

const REASON_LANGUAGE: Record<LanguageCode, string> = {
  en: "English",
  ko: "Korean",
};

function buildVerificationPrompt(params: {
  diff: string;
  issues: StructuredIssue[];
  suggestions: CodeSuggestion[];
  langCode: LanguageCode;
}): string {
  const { diff, issues, suggestions, langCode } = params;

  const issueList = issues
    .map((issue, i) => {
      const location = issue.file
        ? `${issue.file}${issue.line !== null ? `:${issue.line}` : ""}`
        : "project-level";
      return `[${i}] (${issue.severity}/${issue.category}) ${location}\nTitle: ${issue.title}\nBody: ${issue.body}`;
    })
    .join("\n\n");

  const suggestionList = suggestions
    .map(
      (s, i) =>
        `[${i}] ${s.file}:${s.line} (${s.severity})\nBEFORE:\n${s.before}\nAFTER:\n${s.after}\nWHY: ${s.explanation}`,
    )
    .join("\n\n");

  return `You are a senior engineer acting as the VERIFIER (fact-checker).
A first AI reviewer analyzed the pull request diff below and produced findings.
Your ONLY job is to verify each finding against the diff. You must NOT add new findings.

Verdict policy (be conservative):
- REJECTED: only when the diff gives concrete evidence the finding is wrong
  (e.g. the claimed missing guard actually exists in the diff, the "before" code
  does not behave as the finding claims, the issue misreads the change).
- CONFIRMED: the diff clearly supports the finding.
- UNCERTAIN: plausible but not verifiable from the diff alone. When in doubt, use UNCERTAIN — never REJECTED.

Return a verdict for EVERY index listed. Write each "reason" in ${REASON_LANGUAGE[langCode]}.

## Pull Request Diff
${diff}

## Issues to verify
${issueList.length > 0 ? issueList : "(none)"}

## Suggestions to verify
${suggestionList.length > 0 ? suggestionList : "(none)"}`;
}

/** index 기반 verdict를 입력 배열 길이에 정렬. 누락 index는 UNCERTAIN(보수적 기본값), 범위 밖 index는 무시. */
function alignVerdicts(
  entries: { index: number; verdict: VerificationVerdict; reason: string }[],
  length: number,
): VerdictEntry[] {
  const aligned: VerdictEntry[] = Array.from({ length }, () => ({
    verdict: "UNCERTAIN" as const,
    reason: "",
  }));
  for (const entry of entries) {
    if (entry.index >= 0 && entry.index < length) {
      aligned[entry.index] = { verdict: entry.verdict, reason: entry.reason };
    }
  }
  return aligned;
}

/** 검수자 LLM 호출. 실패 시 throw — 호출부(Inngest step)에서 fail-open 처리한다. */
export async function verifyReview(params: {
  diff: string;
  issues: StructuredIssue[];
  suggestions: CodeSuggestion[];
  langCode: LanguageCode;
}): Promise<VerificationResult> {
  const prompt = buildVerificationPrompt(params);

  const { experimental_output } = await generateText({
    model: google(VERIFIER_MODEL_ID),
    experimental_output: Output.object({ schema: verifierOutputSchema }),
    prompt,
  });

  // SDK 레벨 검증을 신뢰하지 않고 Zod로 재검증 (generate-ai-review와 동일 패턴)
  const parsed = verifierOutputSchema.safeParse(experimental_output);
  if (!parsed.success) {
    throw new Error(`Verifier output re-validation failed: ${parsed.error.message}`);
  }

  return {
    status: "verified",
    issueVerdicts: alignVerdicts(parsed.data.issueVerdicts, params.issues.length),
    suggestionVerdicts: alignVerdicts(parsed.data.suggestionVerdicts, params.suggestions.length),
  };
}

/**
 * 판정을 1차 산출물에 적용해 생존/제외 항목으로 분할하는 순수 함수.
 * - result가 null(검증 미실행)이거나 skipped(검증 실패)면 null 반환 — 호출부는 원본을 그대로 사용.
 * - REJECTED만 제거한다. CONFIRMED/UNCERTAIN은 원래 순서 그대로 유지 (보수적 필터).
 */
export function applyVerification(
  output: StructuredReviewOutput,
  result: VerificationResult | null,
): AppliedVerification | null {
  if (!result || result.status === "skipped") return null;

  const keptIssues: StructuredIssue[] = [];
  const keptIssueVerdicts: VerdictEntry[] = [];
  const rejectedIssues: (StructuredIssue & { reason: string })[] = [];

  output.issues.forEach((issue, index) => {
    const entry = result.issueVerdicts[index] ?? { verdict: "UNCERTAIN" as const, reason: "" };
    if (entry.verdict === "REJECTED") {
      rejectedIssues.push({ ...issue, reason: entry.reason });
    } else {
      keptIssues.push(issue);
      keptIssueVerdicts.push(entry);
    }
  });

  const keptSuggestions: CodeSuggestion[] = [];
  const keptSuggestionVerdicts: VerdictEntry[] = [];
  const rejectedSuggestions: (CodeSuggestion & { reason: string })[] = [];

  output.suggestions.forEach((suggestion, index) => {
    const entry = result.suggestionVerdicts[index] ?? { verdict: "UNCERTAIN" as const, reason: "" };
    if (entry.verdict === "REJECTED") {
      rejectedSuggestions.push({ ...suggestion, reason: entry.reason });
    } else {
      keptSuggestions.push(suggestion);
      keptSuggestionVerdicts.push(entry);
    }
  });

  return {
    keptOutput: { ...output, issues: keptIssues, suggestions: keptSuggestions },
    keptIssueVerdicts,
    keptSuggestionVerdicts,
    rejectedIssues,
    rejectedSuggestions,
  };
}

/** GitHub 리뷰 본문 상단에 붙는 검증 요약 1줄. 검토 대상이 0개면 null. */
export function buildVerificationTrace(
  counts: { reviewedCount: number; excludedCount: number },
  langCode: LanguageCode,
): string | null {
  if (counts.reviewedCount === 0) return null;
  const labels = VERIFICATION_LABELS[langCode];
  const summary = labels.summary
    .replace("{reviewed}", String(counts.reviewedCount))
    .replace("{excluded}", String(counts.excludedCount));
  return `> 🛡️ **${labels.title}** — ${summary}`;
}

/** 검수자 명의의 별도 GitHub 리뷰 엔트리 본문 (body-only, 동일 계정).
 *  이슈별 판정 목록 + 제외 내역 접기. 검토 대상이 0개면 호출하지 않는다 (호출부 가드). */
export function buildVerificationReviewBody(params: {
  keptIssues: StructuredIssue[];
  keptIssueVerdicts: VerdictEntry[];
  rejectedIssues: (StructuredIssue & { reason: string })[];
  rejectedSuggestions: (CodeSuggestion & { reason: string })[];
  reviewedCount: number;
  langCode: LanguageCode;
}): string {
  const { keptIssues, keptIssueVerdicts, rejectedIssues, rejectedSuggestions, reviewedCount, langCode } = params;
  const labels = VERIFICATION_LABELS[langCode];
  const excludedCount = rejectedIssues.length + rejectedSuggestions.length;
  const summary = labels.summary
    .replace("{reviewed}", String(reviewedCount))
    .replace("{excluded}", String(excludedCount));

  const sections: string[] = [`## 🛡️ ${labels.title}`, "", `> ${summary}`];

  if (keptIssues.length > 0) {
    const items = keptIssues.map((issue, index) => {
      const verdict = keptIssueVerdicts[index]?.verdict ?? "UNCERTAIN";
      const mark = verdict === "CONFIRMED" ? "✅" : "⚪";
      return `- ${mark} \`${verdict}\` — ${issue.title}`;
    });
    sections.push("", ...items);
  }

  if (excludedCount > 0) {
    const rejectedLines = [
      ...rejectedIssues.map((issue) => `- ~~${issue.title}~~ — ${issue.reason}`),
      ...rejectedSuggestions.map((s) => `- ~~${s.file}:${s.line}~~ — ${s.reason}`),
    ];
    sections.push(
      "",
      `<details>\n<summary>${labels.excluded} (${excludedCount})</summary>\n\n${rejectedLines.join("\n")}\n\n</details>`,
    );
  }

  sections.push("", "---", "*Generated by HReviewer*");
  return sections.join("\n");
}
