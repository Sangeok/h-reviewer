import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StructuredReviewOutput } from "@/features/ai";

import { StructuredReviewBody } from "./structured-review-body";

const DATA: StructuredReviewOutput = {
  summary: { overview: "Overview", riskLevel: "medium", keyPoints: [] },
  walkthrough: null,
  strengths: [],
  sequenceDiagram: null,
  issues: [
    {
      file: "src/value.ts",
      line: 9,
      title: "Guard input",
      body: "Input is used without validation.",
      impact: "Malformed values can escape.",
      recommendation: "Validate before use.",
      severity: "WARNING",
      category: "bug",
    },
  ],
  suggestions: [
    {
      file: "src/value.ts",
      line: 9,
      before: "oldValue",
      after: "safeValue",
      explanation: "Use the validated value.",
      severity: "WARNING",
    },
  ],
};

describe("StructuredReviewBody", () => {
  it("mirrors every issue detail and accepted suggestion replacement", () => {
    const markup = renderToStaticMarkup(
      <StructuredReviewBody
        data={DATA}
        langCode="en"
        shouldRenderSuggestionSummary
      />,
    );

    expect(markup).toContain("src/value.ts:9");
    expect(markup).toContain("Input is used without validation.");
    expect(markup).toContain("Malformed values can escape.");
    expect(markup).toContain("Validate before use.");
    expect(markup).toContain("Use the validated value.");
    expect(markup).toContain("safeValue");
  });
});
