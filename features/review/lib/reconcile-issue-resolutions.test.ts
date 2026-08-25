import { describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  reviewFindFirst: vi.fn(async () => null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  default: {
    review: { findFirst: databaseMocks.reviewFindFirst },
    reviewIssue: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/github/github", () => ({ getCompareFiles: vi.fn() }));
vi.mock("@/features/ai", () => ({ GENERATOR_MODEL_ID: "fixture-model" }));
vi.mock("ai", () => ({ generateText: vi.fn(), Output: { object: vi.fn() } }));
vi.mock("@ai-sdk/google", () => ({ google: vi.fn() }));

import { reconcileIssueResolutions } from "./reconcile-issue-resolutions";

describe("reconcileIssueResolutions", () => {
  it("selects only a full review as the reconciliation baseline", async () => {
    await reconcileIssueResolutions({
      token: "token",
      headOwner: "octo",
      headRepoName: "sample",
      baseRepositoryId: "repository-1",
      prNumber: 42,
      beforeSha: "before-sha",
      afterSha: "after-sha",
    });

    expect(databaseMocks.reviewFindFirst).toHaveBeenCalledWith({
      where: {
        repositoryId: "repository-1",
        prNumber: 42,
        headSha: "before-sha",
        reviewType: "FULL_REVIEW",
      },
      orderBy: { createdAt: "desc" },
    });
  });
});
