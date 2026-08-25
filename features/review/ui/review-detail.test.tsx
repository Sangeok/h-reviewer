import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ReviewStatus } from "@/lib/generated/prisma/enums";

import type { ReviewDetailData } from "../types";

import ReviewDetail from "./review-detail";

function createReviewDetail(
  overrides: Partial<ReviewDetailData> = {},
): ReviewDetailData {
  const createdAt = new Date("2026-08-25T00:00:00.000Z");

  return {
    id: "review-1",
    repositoryId: "repository-1",
    prNumber: 42,
    prTitle: "Add durable review state",
    prUrl: "https://github.com/example/repository/pull/42",
    review: "## Completed review body",
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
    suggestions: [],
    ...overrides,
  };
}

function renderReviewDetail(review: ReviewDetailData): string {
  return renderToStaticMarkup(
    <ReviewDetail review={review} structuredData={null} langCode="en" />,
  );
}

describe("ReviewDetail", () => {
  it.each<ReviewStatus>(["PENDING", "RUNNING", "POSTING"])(
    "renders a status explanation instead of markdown for %s",
    (status) => {
      const markup = renderReviewDetail(
        createReviewDetail({
          status,
          review: "UNRENDERED ACTIVE MARKDOWN",
        }),
      );

      expect(markup).not.toContain("UNRENDERED ACTIVE MARKDOWN");
      expect(markup).toContain(
        status === "PENDING"
          ? "queued and waiting"
          : status === "RUNNING"
            ? "analyzing the pull request"
            : "being posted to GitHub",
      );
    },
  );

  it("renders sanitized failure metadata and retry availability", () => {
    const markup = renderReviewDetail(
      createReviewDetail({
        status: "FAILED",
        failureStage: "VERIFY",
        failureMessage: "Review verification failed safely.",
        review: "RAW FAILURE BODY MUST NOT RENDER",
      }),
    );

    expect(markup).toContain("Review verification failed safely.");
    expect(markup).toContain("This review can be retried.");
    expect(markup).not.toContain("RAW FAILURE BODY MUST NOT RENDER");
  });

  it("renders a safe superseded explanation instead of stale markdown", () => {
    const markup = renderReviewDetail(
      createReviewDetail({
        status: "SUPERSEDED",
        review: "STALE DETAIL MUST NOT RENDER",
      }),
    );

    expect(markup).toContain("newer head is being reviewed");
    expect(markup).not.toContain("STALE DETAIL MUST NOT RENDER");
  });

  it("renders markdown only for a completed review", () => {
    const markup = renderReviewDetail(createReviewDetail());

    expect(markup).toContain("Completed review body");
  });
});
