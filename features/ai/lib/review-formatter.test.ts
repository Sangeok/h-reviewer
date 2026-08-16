import { describe, expect, it } from "vitest";
import { formatStructuredReviewToMarkdown } from "./review-formatter";
import type { StructuredReviewOutput } from "./review-schema";
import type { CodeSuggestion, StructuredIssue } from "../types";

function makeIssue(overrides: Partial<StructuredIssue> = {}): StructuredIssue {
  return {
    file: "src/a.ts", line: 1, title: "지적 제목", body: "지적 본문",
    impact: "영향 설명", recommendation: "권장 조치",
    severity: "SUGGESTION", category: "bug",
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<CodeSuggestion> = {}): CodeSuggestion {
  return {
    file: "src/b.ts", line: 2, before: "a", after: "b",
    explanation: "why", severity: "SUGGESTION",
    ...overrides,
  };
}

function makeOutput(overrides: Partial<StructuredReviewOutput> = {}): StructuredReviewOutput {
  return {
    summary: { overview: "개요 문단", riskLevel: "low", keyPoints: [] },
    walkthrough: null, strengths: [], sequenceDiagram: null,
    issues: [], suggestions: [],
    ...overrides,
  };
}

describe("formatStructuredReviewToMarkdown — 결론 줄", () => {
  it("배지와 지적·제안 카운트를 첫 줄로 렌더한다", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({
        summary: { overview: "개요", riskLevel: "medium", keyPoints: [] },
        issues: [makeIssue(), makeIssue({ file: null, line: null })],
        suggestions: [makeSuggestion()],
      }),
      "ko",
    );
    const firstLine = md.split("\n")[0];
    expect(firstLine).toContain("Medium Risk");
    expect(firstLine).toContain("지적 2건");
    expect(firstLine).toContain("제안 1건");
  });

  it("CRITICAL·WARNING이 있으면 괄호 내역을 붙인다", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({
        issues: [
          makeIssue({ severity: "CRITICAL" }),
          makeIssue({ severity: "WARNING" }),
          makeIssue({ severity: "SUGGESTION" }),
        ],
      }),
      "ko",
    );
    expect(md.split("\n")[0]).toContain("지적 3건 (🚨 1 · ⚠️ 1)");
  });

  it("CRITICAL·WARNING이 없으면 괄호를 생략한다", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({ issues: [makeIssue({ severity: "SUGGESTION" })] }),
      "ko",
    );
    const firstLine = md.split("\n")[0];
    expect(firstLine).toContain("지적 1건");
    expect(firstLine).not.toContain("(");
    expect(firstLine).not.toContain("🚨");
  });

  it("이슈·제안이 0개여도 카운트를 사실대로 렌더한다", () => {
    const md = formatStructuredReviewToMarkdown(makeOutput(), "ko");
    expect(md.split("\n")[0]).toContain("지적 0건 · 제안 0건");
  });
});

describe("formatStructuredReviewToMarkdown — 발견된 문제점", () => {
  it("file+line 이슈는 한 줄 요약으로 렌더하고 전문은 본문에 넣지 않는다", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({
        issues: [
          makeIssue({ file: "lib/db.ts", line: 15, title: "널 체크 누락", impact: "워커 점유" }),
        ],
      }),
      "ko",
    );
    expect(md).toContain("`lib/db.ts:15` — 널 체크 누락");
    expect(md).not.toContain("워커 점유"); // impact 전문은 인라인 코멘트 몫
    expect(md).toContain("발견된 문제점 (1)");
    expect(md).toContain("1:1");
  });

  it("line이 null인 이슈는 기존 전문 형식을 유지한다", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({
        issues: [
          makeIssue({ file: null, line: null, title: "프로젝트 레벨", impact: "영향 A", recommendation: "조치 B" }),
        ],
      }),
      "ko",
    );
    expect(md).toContain("### ");
    expect(md).toContain("프로젝트 레벨");
    expect(md).toContain("영향 A");
    expect(md).toContain("조치 B");
  });

  it("file이 null이고 line만 있는 이슈도 본문 전문으로 렌더한다 (유실 edge 폐쇄)", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({
        issues: [makeIssue({ file: null, line: 42, title: "file 없는 지적", impact: "영향 C" })],
      }),
      "ko",
    );
    expect(md).toContain("file 없는 지적");
    expect(md).toContain("영향 C");
  });
});

describe("formatStructuredReviewToMarkdown — 요약·강점·순서", () => {
  it("배지는 결론 줄에 1회만 나타나고 요약 섹션에는 배지·리뷰 포인트가 없다", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({
        summary: { overview: "개요", riskLevel: "high", keyPoints: ["포인트1"] },
      }),
      "ko",
    );
    expect(md.split("High Risk").length - 1).toBe(1);
    expect(md).not.toContain("리뷰 포인트");
    expect(md).not.toContain("포인트1");
  });

  it("강점은 앞의 2개만 렌더한다", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({ strengths: ["강점1", "강점2", "강점3", "강점4"] }),
      "ko",
    );
    expect(md).toContain("강점1");
    expect(md).toContain("강점2");
    expect(md).not.toContain("강점3");
    expect(md).not.toContain("강점4");
  });

  it("섹션 순서: 결론 → 문제점 → 제안 → 요약 → 강점", () => {
    const md = formatStructuredReviewToMarkdown(
      makeOutput({
        issues: [makeIssue()],
        suggestions: [makeSuggestion()],
        strengths: ["강점1"],
      }),
      "ko",
    );
    const idxVerdict = md.indexOf("Low Risk");
    const idxIssues = md.indexOf("## 발견된 문제점");
    const idxSuggestions = md.indexOf("## 개선 제안 (1)");
    const idxSummary = md.indexOf("## 요약");
    const idxStrengths = md.indexOf("## 강점");
    expect(idxVerdict).toBeGreaterThanOrEqual(0);
    expect(idxIssues).toBeGreaterThan(idxVerdict);
    expect(idxSuggestions).toBeGreaterThan(idxIssues);
    expect(idxSummary).toBeGreaterThan(idxSuggestions);
    expect(idxStrengths).toBeGreaterThan(idxSummary);
  });
});
