import { describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  reviewFindFirst: vi.fn(async () => null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  default: {
    review: { findFirst: databaseMocks.reviewFindFirst },
    suggestion: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/github/github", () => ({
  getCompareFiles: vi.fn(),
  getFileContent: vi.fn(),
}));

import { reconcileNativeSuggestions } from "./reconcile-native-suggestions";

describe("reconcileNativeSuggestions", () => {
  it("selects only a full review as the suggestion baseline", async () => {
    await reconcileNativeSuggestions({
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
