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
  /** keptOutput.issues와 index 정렬 (CONFIRMED | UNCERTAIN만 포함).
   *  review.ts의 checkLengthAlignment가 게시·저장 직전 이 길이 동등성을 soft-assert한다. */
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

/** 제외 항목 수. 게시 게이트(review.ts Step 6.5)와 카드 헤더가 같은 정의를 쓰도록 한 곳에 둔다.
 *  대시보드 패널(verification-panel.tsx)의 자체 계산은 건드리지 않는다 —
 *  features/review/ui가 features/ai/lib를 import하게 만드는 것은 2항 덧셈에 비해 비싼 결합이다. */
export function countExcluded(
  v: Pick<AppliedVerification, "rejectedIssues" | "rejectedSuggestions">,
): number {
  return v.rejectedIssues.length + v.rejectedSuggestions.length;
}

/** 검수자 명의의 별도 GitHub 리뷰 엔트리 본문 (body-only, 동일 계정).
 *  제외한 항목만 담는다 — 생존 항목의 판정은 인라인 배지(`formatIssueComment`의
 *  `issue.verifierConfirmed` 분기)와 대시보드 패널(`VerificationPanel`)이 이미
 *  전달하므로 여기서 반복하지 않는다.
 *  제외가 0개면 null을 반환한다 — 호출부는 게시를 건너뛴다. */
export function buildVerificationReviewBody(params: {
  rejectedIssues: (StructuredIssue & { reason: string })[];
  rejectedSuggestions: (CodeSuggestion & { reason: string })[];
  langCode: LanguageCode;
}): string | null {
  const { rejectedIssues, rejectedSuggestions, langCode } = params;
  const excludedCount = countExcluded(params);
  if (excludedCount === 0) return null;

  const labels = VERIFICATION_LABELS[langCode];

  const items = [
    ...rejectedIssues.map((issue) => {
      const location = issue.file
        ? `\`${issue.file}${issue.line !== null ? `:${issue.line}` : ""}\` · `
        : "";
      const title = (issue.title ?? "").trim();
      const reason = (issue.reason ?? "").trim();
      const heading = `**~~${location}${title}~~**`;
      return reason ? `${heading}\n\n${reason}` : heading;
    }),
    ...rejectedSuggestions.map((s) => {
      const reason = (s.reason ?? "").trim();
      const heading = `**~~\`${s.file}:${s.line}\`~~**`;
      return reason ? `${heading}\n\n${reason}` : heading;
    }),
  ];

  return [
    `## 🛡️ ${labels.excludedHeading} (${excludedCount})`,
    "",
    labels.excludedIntro,
    "",
    items.join("\n\n"),
    "",
    "---",
    "*Generated by HReviewer*",
  ].join("\n");
}
