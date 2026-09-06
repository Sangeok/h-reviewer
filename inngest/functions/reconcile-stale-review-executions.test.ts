import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createReconcileStaleReviewExecutionsHandler,
  type ReconcileReviewExecutionsDependencies,
  type ReconcileReviewExecutionsStep,
} from "./reconcile-stale-review-executions";
import type { GithubReviewArtifact } from "@/lib/github/github-review-artifacts";
import type {
  ReviewExecutionStage,
  ReviewStatus,
  TrialCreditState,
} from "@/lib/generated/prisma/enums";

const NOW = new Date("2026-08-29T00:00:00Z");

type Candidate = {
  id: string;
  status: ReviewStatus;
  attemptCount: number;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  review: string;
  headSha: string | null;
  githubAuthorId: string | null;
  githubMainReviewId: string | null;
  githubMainPostedAt: Date | null;
  artifactLookupMissedAt: Date | null;
  lastCompletedStage: ReviewExecutionStage | null;
  executionLeaseToken: string | null;
  executionLeaseExpiresAt: Date | null;
  trialCreditState: TrialCreditState;
  repository: { owner: string; name: string; userId: string };
  prNumber: number;
};

const BASE_CANDIDATE: Candidate = {
  id: "review-1",
  status: "POSTING" as const,
  attemptCount: 1,
  reviewType: "FULL_REVIEW" as const,
  review: "Persisted review",
  headSha: "head-sha",
  githubAuthorId: "99",
  githubMainReviewId: null,
  githubMainPostedAt: null,
  artifactLookupMissedAt: null,
  lastCompletedStage: "PERSISTED" as const,
  executionLeaseToken: "expired-token",
  executionLeaseExpiresAt: new Date("2026-08-28T23:00:00Z"),
  trialCreditState: "NOT_APPLICABLE" as const,
  repository: { owner: "octo", name: "sample", userId: "user-1" },
  prNumber: 42,
};

function createHarness(candidate: Candidate) {
  const findMany = vi.fn(async () => [candidate]);
  const updateMany = vi.fn(
    async (_input: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      void _input;
      return { count: 1 };
    },
  );
  const accountFindFirst = vi.fn(async () => ({ accessToken: "github-token" }));
  const consumeTrialCredit = vi.fn(async () => true);
  const releaseTrialCredit = vi.fn(async () => true);
  const transactionClient = { review: { updateMany } };
  const findGithubReviewArtifact = vi.fn<
    () => Promise<GithubReviewArtifact | null>
  >(async () => null);
  const stepIds: string[] = [];
  const step: ReconcileReviewExecutionsStep = {
    async run<T>(id: string, handler: () => Promise<T> | T): Promise<T> {
      stepIds.push(id);
      return handler();
    },
  };
  const dependencies = {
    prisma: {
      review: { findMany, updateMany },
      account: { findFirst: accountFindFirst },
      $transaction: vi.fn(
        async (operation: (client: typeof transactionClient) => Promise<unknown>) =>
          operation(transactionClient),
      ),
    },
    findGithubReviewArtifact,
    consumeTrialCredit,
    releaseTrialCredit,
    now: () => NOW,
    createToken: () => "reconciler-token",
  } as unknown as ReconcileReviewExecutionsDependencies;

  return {
    handler: createReconcileStaleReviewExecutionsHandler(dependencies),
    step,
    stepIds,
    updateMany,
    findGithubReviewArtifact,
    consumeTrialCredit,
    releaseTrialCredit,
  };
}

describe("reconcile stale review executions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails a stale pre-persist execution without a GitHub lookup", async () => {
    const harness = createHarness({
      ...BASE_CANDIDATE,
      status: "PENDING",
      review: "",
      lastCompletedStage: "QUEUED",
    });

    await expect(harness.handler({ step: harness.step })).resolves.toEqual({
      processed: 1,
    });

    expect(harness.findGithubReviewArtifact).not.toHaveBeenCalled();
    expect(harness.updateMany.mock.calls.at(-1)?.[0].data).toMatchObject({
      status: "FAILED",
      failureStage: "RECONCILE",
      executionLeaseToken: null,
    });
  });

  it("keeps the first independent marker miss inside the grace window", async () => {
    const harness = createHarness(BASE_CANDIDATE);

    await harness.handler({ step: harness.step });

    expect(harness.findGithubReviewArtifact).toHaveBeenCalledOnce();
    expect(harness.updateMany.mock.calls.at(-1)?.[0].data).toMatchObject({
      artifactLookupMissedAt: NOW,
    });
    expect(harness.updateMany.mock.calls.at(-1)?.[0].data).not.toHaveProperty(
      "status",
    );
  });

  it("converges a marker-confirmed failed review to completed", async () => {
    const harness = createHarness({
      ...BASE_CANDIDATE,
      status: "FAILED",
    });
    harness.findGithubReviewArtifact.mockResolvedValue({
      id: "github-review-1",
      kind: "pull-request-review",
      commitId: "head-sha",
      postedAt: NOW,
      body: "Persisted review",
      authorId: "99",
    });

    await harness.handler({ step: harness.step });

    expect(harness.updateMany.mock.calls.at(-1)?.[0].data).toMatchObject({
      status: "COMPLETED",
      githubMainReviewId: "github-review-1",
      githubMainPostedAt: NOW,
      lastCompletedStage: "MAIN_POSTED",
      executionLeaseToken: null,
    });
  });

  it("extends only the lease when the GitHub lookup fails", async () => {
    const harness = createHarness(BASE_CANDIDATE);
    harness.findGithubReviewArtifact.mockRejectedValue(new Error("unavailable"));

    await harness.handler({ step: harness.step });

    const finalData = harness.updateMany.mock.calls.at(-1)?.[0].data;
    expect(finalData).toHaveProperty("executionLeaseExpiresAt");
    expect(finalData).not.toHaveProperty("status");
  });

  it("releases a reserved credit in the same transaction after confirmed absence", async () => {
    const harness = createHarness({
      ...BASE_CANDIDATE,
      status: "FAILED",
      trialCreditState: "RESERVED",
      artifactLookupMissedAt: new Date(
        NOW.getTime() - 5 * 60 * 1000,
      ),
    });

    await harness.handler({ step: harness.step });

    expect(harness.releaseTrialCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewId: "review-1",
        leaseToken: "reconciler-token",
        leaseOwner: "RECONCILER",
      }),
      expect.objectContaining({ review: expect.any(Object) }),
    );
    expect(harness.updateMany.mock.calls.at(-1)?.[0].data).toMatchObject({
      status: "FAILED",
      executionLeaseToken: null,
    });
  });
});
