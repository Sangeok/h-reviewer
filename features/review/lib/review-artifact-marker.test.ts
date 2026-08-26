import { describe, expect, it } from "vitest";

import { buildReviewArtifactMarker } from "./review-artifact-marker";

describe("buildReviewArtifactMarker", () => {
  it("builds every T07 artifact marker deterministically", () => {
    expect(buildReviewArtifactMarker("review_1", "main")).toBe(
      "<!-- hreviewer:review:review_1:main -->",
    );
    expect(buildReviewArtifactMarker("review_1", "verification")).toBe(
      "<!-- hreviewer:review:review_1:verification -->",
    );
    expect(buildReviewArtifactMarker("review_1", "summary")).toBe(
      "<!-- hreviewer:review:review_1:summary -->",
    );
    expect(
      buildReviewArtifactMarker("review_1", { kind: "issue", id: "issue_1" }),
    ).toBe("<!-- hreviewer:review:review_1:issue:issue_1 -->");
    expect(
      buildReviewArtifactMarker("review_1", {
        kind: "suggestion",
        id: "suggestion_1",
      }),
    ).toBe("<!-- hreviewer:review:review_1:suggestion:suggestion_1 -->");
  });

  it("rejects values that could escape the marker format", () => {
    expect(() => buildReviewArtifactMarker("review:1", "main")).toThrow(
      "database identifier",
    );
    expect(() =>
      buildReviewArtifactMarker("review_1", {
        kind: "issue",
        id: "issue --> injected",
      }),
    ).toThrow("database identifier");
  });
});
