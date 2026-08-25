import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ReviewStatus } from "@/lib/generated/prisma/enums";

import {
  createReviewRequest,
  resumeReviewRequest,
  retryReviewRequest,
  type ReviewRequestDependencies,
} from "./review-request";

const NOW = new Date("2026-08-25T00:00:00.000Z");

type FakeReview = {
  id: string;
  requestKey: string;
  status: ReviewStatus;
  attemptCount: number;
  repositoryId: string;
  prNumber: number;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  executionLeaseToken: string | null;
  executionLeaseOwner: "QUEUE" | "WORKER" | "RECONCILER" | null;
  executionLeaseExpiresAt: Date | null;
  lastCompletedStage: string | null;
  failureStage: string | null;
  failureMessage: string | null;
  createData: Record<string, unknown>;
};

function createRequestHarness(): {
  dependencies: ReviewRequestDependencies;
  reviews: FakeReview[];
  sendEvent: ReturnType<typeof vi.fn>;
  getPullRequestSnapshot: ReturnType<typeof vi.fn>;
  bindGithubWebhookDeliveryRequest: ReturnType<typeof vi.fn>;
} {
  const reviews: FakeReview[] = [];
  const reviewDelegate = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const requestKey = String(data.requestKey);
      if (reviews.some((review) => review.requestKey === requestKey)) {
        throw { code: "P2002", meta: { target: ["requestKey"] } };
      }

      const review: FakeReview = {
        id: `review-${reviews.length + 1}`,
        requestKey,
        status: data.status as ReviewStatus,
        attemptCount: Number(data.attemptCount),
        repositoryId: String(data.repositoryId),
        prNumber: Number(data.prNumber),
        reviewType: data.reviewType as FakeReview["reviewType"],
        executionLeaseToken: String(data.executionLeaseToken),
        executionLeaseOwner: data.executionLeaseOwner as FakeReview["executionLeaseOwner"],
        executionLeaseExpiresAt: data.executionLeaseExpiresAt as Date,
        lastCompletedStage: null,
        failureStage: null,
        failureMessage: null,
        createData: data,
      };
      reviews.push(review);
      return review;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id?: string; requestKey?: string } }) =>
      reviews.find(
        (review) =>
          (where.id !== undefined && review.id === where.id) ||
          (where.requestKey !== undefined && review.requestKey === where.requestKey),
      ) ?? null,
    ),
    updateMany: vi.fn(
      async ({ where, data }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const review = reviews.find((candidate) => candidate.id === where.id);
        const allowedStatuses =
          typeof where.status === "object" && where.status !== null && "in" in where.status
            ? (where.status.in as ReviewStatus[])
            : [where.status as ReviewStatus];
        const matches =
          review &&
          allowedStatuses.includes(review.status) &&
          (where.attemptCount === undefined ||
            review.attemptCount === where.attemptCount) &&
          (where.executionLeaseToken === undefined ||
            review.executionLeaseToken === where.executionLeaseToken) &&
          (where.executionLeaseOwner === undefined ||
            review.executionLeaseOwner === where.executionLeaseOwner);

        if (!review || !matches) return { count: 0 };

        if (typeof data.status === "string") review.status = data.status as ReviewStatus;
        if (typeof data.attemptCount === "number") review.attemptCount = data.attemptCount;
        if ("executionLeaseToken" in data) {
          review.executionLeaseToken = data.executionLeaseToken as string | null;
        }
        if ("executionLeaseOwner" in data) {
          review.executionLeaseOwner = data.executionLeaseOwner as FakeReview["executionLeaseOwner"];
        }
        if ("executionLeaseExpiresAt" in data) {
          review.executionLeaseExpiresAt = data.executionLeaseExpiresAt as Date | null;
        }
        if ("lastCompletedStage" in data) {
          review.lastCompletedStage = data.lastCompletedStage as string | null;
        }
        if ("failureStage" in data) {
          review.failureStage = data.failureStage as string | null;
        }
        if ("failureMessage" in data) {
          review.failureMessage = data.failureMessage as string | null;
        }
        return { count: 1 };
      },
    ),
  };
  const prisma = {
    review: reviewDelegate,
    $transaction: vi.fn(
      async (callback: (client: { review: typeof reviewDelegate }) => Promise<unknown>) =>
        callback({ review: reviewDelegate }),
    ),
  };
  const sendEvent = vi.fn(async () => ({ ids: ["event-1"] }));
  const bindGithubWebhookDeliveryRequest = vi.fn(async () => undefined);
  const getPullRequestSnapshot = vi.fn(async () => ({
    title: "Improve coordinator",
    url: "https://github.com/octo/sample/pull/42",
    headSha: "head-sha",
    state: "open",
    merged: false,
  }));
  const dependencies: ReviewRequestDependencies = {
    prisma: prisma as unknown as ReviewRequestDependencies["prisma"],
    getRepositoryWithToken: vi.fn(async () => ({
      repository: {
        id: "repository-1",
        user: {
          id: "user-1",
          maxSuggestions: 3,
          verificationEnabled: true,
        },
      },
      accessToken: "github-token",
      githubAuthorId: "github-user-1",
    })),
    getPullRequestSnapshot,
    getUserLanguageByUserId: vi.fn(async (): Promise<"ko"> => "ko"),
    getUserTier: vi.fn(async (): Promise<"PRO"> => "PRO"),
    bindGithubWebhookDeliveryRequest,
    sendEvent,
    now: () => NOW,
  };

  return {
    dependencies,
    reviews,
    sendEvent,
    getPullRequestSnapshot,
    bindGithubWebhookDeliveryRequest,
  };
}

function createFullReviewInput() {
  return {
    owner: "octo",
    repo: "sample",
    prNumber: 42,
    reviewType: "FULL_REVIEW",
    reviewMode: "FULL",
    requestSource: "AUTOMATIC",
    dispatchMode: "DIRECT",
  } as const;
}

describe("review request coordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending review before sending one minimal typed event", async () => {
    const { dependencies, reviews, sendEvent } = createRequestHarness();

    const result = await createReviewRequest(createFullReviewInput(), dependencies);

    expect(result).toMatchObject({ kind: "created", status: "PENDING" });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.createData).toMatchObject({
      review: "",
      langCode: "ko",
      headSha: "head-sha",
      githubAuthorId: "github-user-1",
      status: "PENDING",
      executionLeaseOwner: "QUEUE",
      trialCreditState: "NOT_APPLICABLE",
    });
    expect(sendEvent).toHaveBeenCalledWith({
      id: "hreviewer:review-run:review-1:1",
      name: "pr.review.requested",
      data: {
        reviewId: "review-1",
        attempt: 1,
        debounceKey: "repository-1:42",
      },
    });
    expect(reviews[0]?.lastCompletedStage).toBe("QUEUED");
  });

  it("returns an existing semantic request without sending another event", async () => {
    const { dependencies, reviews, sendEvent } = createRequestHarness();

    await createReviewRequest(createFullReviewInput(), dependencies);
    const duplicate = await createReviewRequest(
      { ...createFullReviewInput(), requestSource: "COMMAND" },
      dependencies,
    );

    expect(duplicate).toMatchObject({
      kind: "existing",
      reviewId: "review-1",
      status: "PENDING",
    });
    expect(reviews).toHaveLength(1);
    expect(sendEvent).toHaveBeenCalledTimes(1);
  });

  it("binds a new and an existing semantic request inside their transactions", async () => {
    const {
      dependencies,
      bindGithubWebhookDeliveryRequest,
    } = createRequestHarness();
    const transportBinding = {
      kind: "GITHUB_WEBHOOK",
      deliveryRowId: "delivery-row-1",
      leaseToken: "delivery-lease-1",
    } as const;

    await createReviewRequest(
      { ...createFullReviewInput(), transportBinding },
      dependencies,
    );
    await createReviewRequest(
      {
        ...createFullReviewInput(),
        requestSource: "COMMAND",
        transportBinding: {
          ...transportBinding,
          deliveryRowId: "delivery-row-2",
          leaseToken: "delivery-lease-2",
        },
      },
      dependencies,
    );

    expect(bindGithubWebhookDeliveryRequest).toHaveBeenNthCalledWith(
      1,
      {
        deliveryRowId: "delivery-row-1",
        leaseToken: "delivery-lease-1",
        requestKey: "FULL_REVIEW:FULL:repository-1:42:head-sha:default",
      },
      expect.objectContaining({ review: expect.any(Object) }),
    );
    expect(bindGithubWebhookDeliveryRequest).toHaveBeenNthCalledWith(
      2,
      {
        deliveryRowId: "delivery-row-2",
        leaseToken: "delivery-lease-2",
        requestKey: "FULL_REVIEW:FULL:repository-1:42:head-sha:default",
      },
      expect.objectContaining({ review: expect.any(Object) }),
    );
  });

  it("rejects a free full review before snapshot or durable side effects", async () => {
    const { dependencies, reviews, sendEvent, getPullRequestSnapshot } =
      createRequestHarness();
    dependencies.getUserTier = vi.fn(async (): Promise<"FREE"> => "FREE");

    await expect(
      createReviewRequest(createFullReviewInput(), dependencies),
    ).resolves.toMatchObject({
      kind: "rejected",
      reason: "PLAN_RESTRICTED",
    });
    expect(getPullRequestSnapshot).not.toHaveBeenCalled();
    expect(reviews).toHaveLength(0);
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("uses distinct semantic keys and event payloads for review and summary", async () => {
    const { dependencies, reviews, sendEvent } = createRequestHarness();

    await createReviewRequest(createFullReviewInput(), dependencies);
    await createReviewRequest(
      {
        ...createFullReviewInput(),
        reviewType: "SUMMARY",
        requestSource: "COMMAND",
      },
      dependencies,
    );

    expect(reviews[0]?.requestKey).not.toBe(reviews[1]?.requestKey);
    expect(sendEvent).toHaveBeenLastCalledWith({
      id: "hreviewer:summary-run:review-2:1",
      name: "pr.summary.requested",
      data: { reviewId: "review-2", attempt: 1 },
    });
  });

  it("records an exact queue failure and returns dispatch metadata", async () => {
    const { dependencies, reviews, sendEvent } = createRequestHarness();
    sendEvent.mockRejectedValue(new Error("queue unavailable"));

    const result = await createReviewRequest(createFullReviewInput(), dependencies);

    expect(result).toMatchObject({
      kind: "dispatch-failed",
      reviewId: "review-1",
      status: "FAILED",
      failureStage: "QUEUE",
    });
    expect(reviews[0]).toMatchObject({
      status: "FAILED",
      failureStage: "QUEUE",
      executionLeaseToken: null,
      executionLeaseOwner: null,
    });
  });

  it.each(["resolve", "reject"] as const)(
    "returns factual RUNNING when worker claim wins before send %s",
    async (settlement) => {
      const { dependencies, reviews, sendEvent } = createRequestHarness();
      sendEvent.mockImplementation(async () => {
        const review = reviews[0];
        if (!review) throw new Error("missing review fixture");
        review.status = "RUNNING";
        review.executionLeaseToken = "worker-token";
        review.executionLeaseOwner = "WORKER";
        if (settlement === "reject") throw new Error("ambiguous send");
        return { ids: ["event-1"] };
      });

      const result = await createReviewRequest(createFullReviewInput(), dependencies);

      expect(result).toMatchObject({ kind: "created", status: "RUNNING" });
      expect(reviews[0]).toMatchObject({
        executionLeaseToken: "worker-token",
        executionLeaseOwner: "WORKER",
      });
    },
  );

  it("rejects closed pull requests without a review row or event", async () => {
    const { dependencies, reviews, sendEvent, getPullRequestSnapshot } =
      createRequestHarness();
    getPullRequestSnapshot.mockResolvedValue({
      title: "Closed PR",
      url: "https://github.com/octo/sample/pull/42",
      headSha: "head-sha",
      state: "closed",
      merged: false,
    });

    await expect(
      createReviewRequest(createFullReviewInput(), dependencies),
    ).resolves.toMatchObject({
      kind: "rejected",
      reason: "PR_NOT_REVIEWABLE",
    });
    expect(reviews).toHaveLength(0);
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("retries the same failed row with only its attempt incremented", async () => {
    const { dependencies, reviews, sendEvent } = createRequestHarness();
    await createReviewRequest(createFullReviewInput(), dependencies);
    const review = reviews[0];
    if (!review) throw new Error("missing review fixture");
    review.status = "FAILED";
    review.executionLeaseToken = null;
    review.executionLeaseOwner = null;
    review.executionLeaseExpiresAt = null;
    sendEvent.mockClear();

    const result = await retryReviewRequest(review.id, dependencies);

    expect(result).toMatchObject({
      kind: "existing",
      reviewId: "review-1",
      status: "PENDING",
    });
    expect(reviews).toHaveLength(1);
    expect(review.attemptCount).toBe(2);
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hreviewer:review-run:review-1:2",
        data: expect.objectContaining({ attempt: 2 }),
      }),
    );
  });

  it("resumes a bound queue failure on the same review without a new snapshot", async () => {
    const { dependencies, reviews, sendEvent, getPullRequestSnapshot } =
      createRequestHarness();
    sendEvent.mockRejectedValueOnce(new Error("queue unavailable"));
    const failed = await createReviewRequest(createFullReviewInput(), dependencies);
    if (!("requestKey" in failed)) throw new Error("Missing request key");
    sendEvent.mockClear();
    getPullRequestSnapshot.mockClear();

    const resumed = await resumeReviewRequest(failed.requestKey, dependencies);

    expect(resumed).toMatchObject({
      kind: "existing",
      reviewId: "review-1",
      status: "PENDING",
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.attemptCount).toBe(2);
    expect(getPullRequestSnapshot).not.toHaveBeenCalled();
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hreviewer:review-run:review-1:2",
        data: expect.objectContaining({ attempt: 2 }),
      }),
    );
  });

  it("resends an unacknowledged pending request with the same attempt and event ID", async () => {
    const { dependencies, reviews, sendEvent, getPullRequestSnapshot } =
      createRequestHarness();
    await createReviewRequest(createFullReviewInput(), dependencies);
    const review = reviews[0];
    if (!review) throw new Error("Missing review fixture");
    review.lastCompletedStage = null;
    sendEvent.mockClear();
    getPullRequestSnapshot.mockClear();

    const resumed = await resumeReviewRequest(review.requestKey, dependencies);

    expect(resumed).toMatchObject({ kind: "existing", status: "PENDING" });
    expect(review.attemptCount).toBe(1);
    expect(getPullRequestSnapshot).not.toHaveBeenCalled();
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hreviewer:review-run:review-1:1",
        data: expect.objectContaining({ attempt: 1 }),
      }),
    );
  });

  it("does not redispatch an already acknowledged pending request", async () => {
    const { dependencies, reviews, sendEvent, getPullRequestSnapshot } =
      createRequestHarness();
    await createReviewRequest(createFullReviewInput(), dependencies);
    const review = reviews[0];
    if (!review) throw new Error("Missing review fixture");
    sendEvent.mockClear();
    getPullRequestSnapshot.mockClear();

    await expect(
      resumeReviewRequest(review.requestKey, dependencies),
    ).resolves.toMatchObject({ kind: "existing", status: "PENDING" });
    expect(sendEvent).not.toHaveBeenCalled();
    expect(getPullRequestSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a delivery request key without a persisted review", async () => {
    const { dependencies, sendEvent, getPullRequestSnapshot } =
      createRequestHarness();

    await expect(
      resumeReviewRequest("missing-request", dependencies),
    ).rejects.toMatchObject({ code: "DELIVERY_REQUEST_NOT_FOUND" });
    expect(sendEvent).not.toHaveBeenCalled();
    expect(getPullRequestSnapshot).not.toHaveBeenCalled();
  });

  it("rotates only an expired queue lease before resending the same attempt", async () => {
    const { dependencies, reviews, sendEvent } = createRequestHarness();
    await createReviewRequest(createFullReviewInput(), dependencies);
    const review = reviews[0];
    if (!review) throw new Error("Missing review fixture");
    const priorLeaseToken = review.executionLeaseToken;
    review.lastCompletedStage = null;
    review.executionLeaseExpiresAt = new Date(NOW.getTime() - 1);
    sendEvent.mockClear();

    await resumeReviewRequest(review.requestKey, dependencies);

    expect(review.attemptCount).toBe(1);
    expect(review.executionLeaseToken).not.toBe(priorLeaseToken);
    expect(review.executionLeaseExpiresAt).toEqual(
      new Date(NOW.getTime() + 30 * 60 * 1000),
    );
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "hreviewer:review-run:review-1:1" }),
    );
  });
});
