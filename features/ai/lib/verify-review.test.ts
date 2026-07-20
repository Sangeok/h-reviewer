import { describe, expect, it } from "vitest";
import { applyVerification } from "./verify-review";
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
