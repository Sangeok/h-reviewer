import { describe, expect, it, vi } from "vitest";

const verifyMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  google: vi.fn((model: string) => model),
}));

vi.mock("ai", () => ({
  generateText: verifyMocks.generateText,
  Output: { object: vi.fn((input: unknown) => input) },
}));

vi.mock("@ai-sdk/google", () => ({
  google: verifyMocks.google,
}));

import {
  applyVerification,
  buildVerificationReviewBody,
  verifyReview,
} from "./verify-review";
import type { VerificationResult } from "./verify-review";
import type { StructuredReviewOutput } from "./review-schema";
import type { CodeSuggestion, StructuredIssue } from "../types";

function makeIssue(title: string): StructuredIssue {
  return {
    file: "src/a.ts", line: 1, title, body: `${title} body`,
    impact: "", recommendation: "", severity: "WARNING", category: "bug",
  };
}

function makeSuggestion(file: string): CodeSuggestion {
  return {
    file, line: 1, before: "a", after: "b",
    explanation: "why", severity: "SUGGESTION",
  };
}

function makeOutput(issues: StructuredIssue[], suggestions: CodeSuggestion[]): StructuredReviewOutput {
  return {
    summary: { overview: "o", riskLevel: "low", keyPoints: [] },
    walkthrough: null, strengths: [], sequenceDiagram: null,
    issues, suggestions,
  };
}

describe("verifyReview", () => {
  it("preserves provider token usage with aligned verdicts", async () => {
    verifyMocks.generateText.mockResolvedValueOnce({
      experimental_output: {
        issueVerdicts: [{ index: 0, verdict: "CONFIRMED", reason: "supported" }],
        suggestionVerdicts: [],
      },
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        reasoningTokens: 10,
        totalTokens: 160,
      },
    });

    const result = await verifyReview({
      diff: "diff --git a/src/a.ts b/src/a.ts",
      issues: [makeIssue("guard is missing")],
      suggestions: [],
      langCode: "en",
    });

    expect(result.usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      reasoningTokens: 10,
      totalTokens: 160,
    });
    expect(result.issueVerdicts).toEqual([
      { verdict: "CONFIRMED", reason: "supported" },
    ]);
  });
});

describe("applyVerification", () => {
  const output = makeOutput(
    [makeIssue("i0"), makeIssue("i1"), makeIssue("i2")],
    [makeSuggestion("s0.ts"), makeSuggestion("s1.ts")],
  );

  const result: VerificationResult = {
    status: "verified",
    issueVerdicts: [
      { verdict: "CONFIRMED", reason: "" },
      { verdict: "REJECTED", reason: "guard exists" },
      { verdict: "UNCERTAIN", reason: "" },
    ],
    suggestionVerdicts: [
      { verdict: "REJECTED", reason: "wrong before" },
      { verdict: "UNCERTAIN", reason: "" },
    ],
  };

  it("REJECTED만 제거하고 나머지는 순서 유지로 분할한다 (파티션 불변식)", () => {
    const applied = applyVerification(output, result);
    expect(applied).not.toBeNull();

    // 파티션: kept + rejected = 입력 전체 (no-computation identity)
    expect(applied!.keptOutput.issues.length + applied!.rejectedIssues.length)
      .toBe(output.issues.length);
    expect(applied!.keptOutput.suggestions.length + applied!.rejectedSuggestions.length)
      .toBe(output.suggestions.length);

    // REJECTED만 rejected로, 순서 보존 (shown 구현의 filter 의미론에서 직접 도출)
    expect(applied!.keptOutput.issues.map((i) => i.title)).toEqual(["i0", "i2"]);
    expect(applied!.rejectedIssues.map((i) => i.title)).toEqual(["i1"]);
    expect(applied!.keptIssueVerdicts.every((v) => v.verdict !== "REJECTED")).toBe(true);

    // kept 판정 배열은 keptOutput.issues와 길이 정렬
    expect(applied!.keptIssueVerdicts.length).toBe(applied!.keptOutput.issues.length);
    expect(applied!.keptSuggestionVerdicts.length).toBe(applied!.keptOutput.suggestions.length);
  });

  it("검증 미실행(null)/생략(skipped)이면 null을 반환한다 (fail-open passthrough)", () => {
    expect(applyVerification(output, null)).toBeNull();
    expect(
      applyVerification(output, { status: "skipped", issueVerdicts: [], suggestionVerdicts: [] }),
    ).toBeNull();
  });

  it("verdict 누락 index는 UNCERTAIN으로 유지된다 (보수적 기본값)", () => {
    const partial: VerificationResult = {
      status: "verified",
      issueVerdicts: [{ verdict: "REJECTED", reason: "x" }], // index 1, 2 누락
      suggestionVerdicts: [],
    };
    const applied = applyVerification(output, partial);
    expect(applied!.keptOutput.issues.map((i) => i.title)).toEqual(["i1", "i2"]);
    expect(applied!.keptIssueVerdicts.every((v) => v.verdict === "UNCERTAIN")).toBe(true);
  });
});

describe("buildVerificationReviewBody", () => {
  const rejectedIssue = {
    ...makeIssue("널 체크 누락"),
    file: "lib/db.ts",
    line: 15,
    reason: "이미 옵셔널 체이닝이 있음",
  };

  it("제외 이슈의 파일·줄·제목·사유를 모두 렌더한다", () => {
    const body = buildVerificationReviewBody({
      rejectedIssues: [rejectedIssue],
      rejectedSuggestions: [],
      langCode: "ko",
    });
    // 취소선은 위치 앞에서 열린다 — `~~널 체크 누락~~`은 부분문자열로 존재하지 않는다.
    expect(body).toContain("**~~`lib/db.ts:15` · 널 체크 누락~~**");
    expect(body).toContain("이미 옵셔널 체이닝이 있음");
    expect(body).toContain("(1)");
  });

  it("제외가 0개면 null을 반환한다", () => {
    expect(
      buildVerificationReviewBody({
        rejectedIssues: [],
        rejectedSuggestions: [],
        langCode: "ko",
      }),
    ).toBeNull();
  });

  it("생존 항목 판정 명부를 포함하지 않는다", () => {
    const body = buildVerificationReviewBody({
      rejectedIssues: [rejectedIssue],
      rejectedSuggestions: [],
      langCode: "ko",
    });
    expect(body).not.toContain("CONFIRMED");
    expect(body).not.toContain("UNCERTAIN");
  });

  it("접힘(<details>)을 쓰지 않는다", () => {
    const body = buildVerificationReviewBody({
      rejectedIssues: [rejectedIssue],
      rejectedSuggestions: [],
      langCode: "ko",
    });
    expect(body).not.toContain("<details>");
  });

  it("reason이 빈 문자열이어도 제목 줄은 렌더한다", () => {
    // 검수자 LLM이 REJECTED에 reason:"" 를 반환하는 경로 방어 (스키마가 빈 문자열 허용)
    const body = buildVerificationReviewBody({
      rejectedIssues: [{ ...rejectedIssue, reason: "" }],
      rejectedSuggestions: [],
      langCode: "ko",
    });
    expect(body).toContain("**~~`lib/db.ts:15` · 널 체크 누락~~**");
    expect(body).not.toContain("\n\n\n");
  });
});
