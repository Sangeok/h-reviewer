import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import type { ReviewStatus } from "@/lib/generated/prisma/enums";

import type { ReviewListItem } from "../../types";

import { ReviewCard } from "./review-card";

function createReviewListItem(
  overrides: Partial<ReviewListItem> = {},
): ReviewListItem {
  const createdAt = new Date("2026-08-25T00:00:00.000Z");

  return {
    id: "review-1",
    repositoryId: "repository-1",
    prNumber: 42,
    prTitle: "Add durable review state",
    prUrl: "https://github.com/example/repository/pull/42",
    review: "Completed review body",
    reviewData: null,
    langCode: "en",
    maxSuggestions: null,
    verificationEnabled: false,
    reviewType: "FULL_REVIEW",
    headSha: "a".repeat(40),
    requestKey: "legacy:review-1",
    requestSource: "LEGACY",
    reviewMode: "FULL",
    status: "COMPLETED",
    failureStage: null,
    failureMessage: null,
    lastCompletedStage: null,
    attemptCount: 1,
    executionLeaseExpiresAt: null,
    executionLeaseToken: null,
    executionLeaseOwner: null,
    githubMainReviewId: null,
    githubMainPostedAt: null,
    githubAuthorId: null,
    artifactLookupMissedAt: null,
    trialCreditState: "NOT_APPLICABLE",
    createdAt,
    updatedAt: createdAt,
    repository: {
      id: "repository-1",
      githubId: BigInt(1),
      name: "repository",
      owner: "example",
      fullName: "example/repository",
      url: "https://github.com/example/repository",
      userId: "user-1",
      createdAt,
      updatedAt: createdAt,
    },
    _count: { suggestions: 0 },
    ...overrides,
  };
}

describe("ReviewCard", () => {
  it.each<ReviewStatus>(["PENDING", "RUNNING", "POSTING"])(
    "renders a status explanation instead of an empty %s review body",
    (status) => {
      const markup = renderToStaticMarkup(
        <ReviewCard
          review={createReviewListItem({
            status,
            review: "UNRENDERED ACTIVE BODY",
          })}
        />,
      );

      expect(markup).not.toContain("UNRENDERED ACTIVE BODY");
      expect(markup).toContain(
        status === "PENDING"
          ? "queued and waiting"
          : status === "RUNNING"
            ? "analyzing the pull request"
            : "being posted to GitHub",
      );
    },
  );

  it("renders a sanitized retryable failure without the stored review body", () => {
    const markup = renderToStaticMarkup(
      <ReviewCard
        review={createReviewListItem({
          status: "FAILED",
          failureStage: "GENERATE",
          failureMessage: "Review generation failed safely.",
          review: "RAW STACK MUST NOT RENDER",
        })}
      />,
    );

    expect(markup).toContain("Review generation failed safely.");
    expect(markup).toContain("This review can be retried.");
    expect(markup).not.toContain("RAW STACK MUST NOT RENDER");
  });

  it("renders a safe superseded explanation without the stored review body", () => {
    const markup = renderToStaticMarkup(
      <ReviewCard
        review={createReviewListItem({
          status: "SUPERSEDED",
          review: "STALE REVIEW MUST NOT RENDER",
        })}
      />,
    );

    expect(markup).toContain("newer head is being reviewed");
    expect(markup).not.toContain("STALE REVIEW MUST NOT RENDER");
  });

  it("renders the persisted review body only for a completed review", () => {
    const markup = renderToStaticMarkup(
      <ReviewCard review={createReviewListItem()} />,
    );

    expect(markup).toContain("Completed review body");
  });
});
