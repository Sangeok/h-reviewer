import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StructuredReviewOutput } from "@/features/ai";

import { StructuredReviewBody } from "./structured-review-body";

const REVIEW_DATA: StructuredReviewOutput = {
  summary: { overview: "Overview", riskLevel: "medium", keyPoints: [] },
  walkthrough: null,
  strengths: [],
  sequenceDiagram: null,
  issues: [{
    file: "src/value.ts",
    line: 9,
    title: "Missing guard",
    body: "The value can be null.",
    impact: "The request can fail.",
    recommendation: "Validate the value first.",
    severity: "WARNING",
    category: "bug",
  }],
  suggestions: [{
    file: "src/value.ts",
    line: 9,
    before: "use(value)",
    after: "if (value) use(value)",
    explanation: "Guard the nullable value.",
    severity: "WARNING",
  }],
};

describe("StructuredReviewBody", () => {
  it("renders every issue field and accepted suggestion replacement", () => {
    const markup = renderToStaticMarkup(
      <StructuredReviewBody
        data={REVIEW_DATA}
        langCode="en"
        shouldRenderSuggestionSummary
      />,
    );

    expect(markup).toContain("src/value.ts:9");
    expect(markup).toContain("The value can be null.");
    expect(markup).toContain("The request can fail.");
    expect(markup).toContain("Validate the value first.");
    expect(markup).toContain("Guard the nullable value.");
    expect(markup).toContain("if (value) use(value)");
  });
});
