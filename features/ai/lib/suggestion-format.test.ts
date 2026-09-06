import { describe, expect, it } from "vitest";

import type { CodeSuggestion } from "../types/suggestion";
import { formatSuggestionSummaryItem } from "./suggestion-format";

function createSuggestion(after: string): CodeSuggestion {
  return {
    file: "src/value.ts",
    line: 5,
    before: "oldValue",
    after,
    explanation: "Replace the unsafe value.",
    severity: "WARNING",
  };
}

describe("formatSuggestionSummaryItem", () => {
  it("preserves location, explanation, and the exact replacement", () => {
    const formatted = formatSuggestionSummaryItem(
      createSuggestion("const value = getSafeValue();"),
    );

    expect(formatted).toContain("src/value.ts:L5");
    expect(formatted).toContain("Replace the unsafe value.");
    expect(formatted).toContain("```\nconst value = getSafeValue();\n```");
  });

  it("uses a longer fence when the replacement contains backticks", () => {
    const formatted = formatSuggestionSummaryItem(
      createSuggestion("const markdown = ```example```;"),
    );

    expect(formatted).toContain("````\nconst markdown = ```example```;\n````");
  });
});
