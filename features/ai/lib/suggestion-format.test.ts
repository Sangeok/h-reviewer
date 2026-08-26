import { describe, expect, it } from "vitest";

import { formatSuggestionSummaryItem } from "./suggestion-format";

describe("formatSuggestionSummaryItem", () => {
  it("preserves location, severity, explanation, and replacement code", () => {
    const item = formatSuggestionSummaryItem({
      file: "src/value.ts",
      line: 7,
      before: "old\nvalue",
      after: "new\nvalue",
      explanation: "Use the safe value.",
      severity: "WARNING",
    });

    expect(item).toContain("WARNING");
    expect(item).toContain("src/value.ts:L7-L8");
    expect(item).toContain("Use the safe value.");
    expect(item).toContain("```\nnew\nvalue\n```");
  });

  it("uses a longer fence when replacement code contains backticks", () => {
    const item = formatSuggestionSummaryItem({
      file: "README.md",
      line: 1,
      before: "old",
      after: "```ts\nconst value = 1;\n```",
      explanation: "Update the example.",
      severity: "SUGGESTION",
    });

    expect(item).toContain("````\n```ts\nconst value = 1;\n```\n````");
  });
});
