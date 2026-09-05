import { describe, expect, it } from "vitest";

import { buildReviewArtifactMarker } from "./review-artifact-marker";

describe("buildReviewArtifactMarker", () => {
  it.each([
    ["main", "<!-- hreviewer:review:review-1:main -->"],
    ["verification", "<!-- hreviewer:review:review-1:verification -->"],
    ["summary", "<!-- hreviewer:review:review-1:summary -->"],
  ] as const)("builds the deterministic %s marker", (part, expected) => {
    expect(buildReviewArtifactMarker("review-1", part)).toBe(expected);
  });

  it("uses only the persisted child ID for issue and suggestion parts", () => {
    expect(
      buildReviewArtifactMarker("review-1", { kind: "issue", id: "issue-1" }),
    ).toBe("<!-- hreviewer:review:review-1:issue:issue-1 -->");
    expect(
      buildReviewArtifactMarker("review-1", {
        kind: "suggestion",
        id: "suggestion-1",
      }),
    ).toBe("<!-- hreviewer:review:review-1:suggestion:suggestion-1 -->");
  });

  it("rejects empty or delimiter-bearing identifiers", () => {
    expect(() => buildReviewArtifactMarker("", "main")).toThrow();
    expect(() =>
      buildReviewArtifactMarker("review-1", { kind: "issue", id: "bad:id" }),
    ).toThrow();
  });
});
