import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../constants/flags", () => ({ FREE_REVIEW_TRIAL_ENABLED: true }));

import { ReviewStateConflictError } from "@/features/review/lib/review-execution-state";

import {
  consumeTrialCredit,
  releaseTrialCredit,
  runReviewTrialTransaction,
  type TrialCreditExecutionFence,
  type TrialMutationClient,
} from "./review-trial";

const FENCE: TrialCreditExecutionFence = {
  reviewId: "review-1",
  attempt: 2,
  leaseToken: "worker-token",
  leaseOwner: "WORKER",
  allowedStatuses: ["POSTING"],
};

type CreditState = {
  status: "POSTING" | "COMPLETED";
  attemptCount: number;
  executionLeaseToken: string | null;
  executionLeaseOwner: "WORKER" | null;
  trialCreditState: "RESERVED" | "RELEASED" | "CONSUMED";
  githubMainReviewId: string | null;
  githubMainPostedAt: Date | null;
};

function createCreditHarness(): {
  client: TrialMutationClient;
  state: CreditState;
  usage: { count: number };
  usageUpdateMany: ReturnType<typeof vi.fn>;
} {
  const state: CreditState = {
    status: "POSTING",
    attemptCount: 2,
    executionLeaseToken: "worker-token",
    executionLeaseOwner: "WORKER",
    trialCreditState: "RESERVED",
    githubMainReviewId: null,
    githubMainPostedAt: null,
  };
  const usage = { count: 1 };
  const reviewUpdateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const statuses = (where.status as { in: string[] }).in;
      const matches =
        where.id === "review-1" &&
        statuses.includes(state.status) &&
        where.attemptCount === state.attemptCount &&
        where.executionLeaseToken === state.executionLeaseToken &&
        where.executionLeaseOwner === state.executionLeaseOwner &&
        where.trialCreditState === state.trialCreditState;
      if (!matches) return { count: 0 };

      if (typeof data.trialCreditState === "string") {
        state.trialCreditState = data.trialCreditState as CreditState["trialCreditState"];
      }
      if (typeof data.githubMainReviewId === "string") {
        state.githubMainReviewId = data.githubMainReviewId;
      }
      if (data.githubMainPostedAt instanceof Date) {
        state.githubMainPostedAt = data.githubMainPostedAt;
      }
      return { count: 1 };
    },
  );
  const reviewFindUnique = vi.fn(
    async ({ select }: { select: Record<string, unknown> }) => {
      if ("repository" in select) {
        return {
          repository: {
            user: { usage: { id: "usage-1" } },
          },
        };
      }

      return { ...state };
    },
  );
  const usageUpdateMany = vi.fn(
    async ({ data }: { data: { trialReviewCreditsUsed: { decrement: number } } }) => {
      if (usage.count <= 0) return { count: 0 };
      usage.count -= data.trialReviewCreditsUsed.decrement;
      return { count: 1 };
    },
  );

  return {
    client: {
      $queryRaw: vi.fn(async () => [{ id: "usage-1" }]),
      review: {
        updateMany: reviewUpdateMany,
        findUnique: reviewFindUnique,
      },
      userUsage: { updateMany: usageUpdateMany },
    } as unknown as TrialMutationClient,
    state,
    usage,
    usageUpdateMany,
  };
}

describe("review trial transactions", () => {
  it("retries three P2034 conflicts and succeeds on the fourth attempt", async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2034" })
      .mockRejectedValueOnce({ code: "P2034" })
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (operation: (client: object) => Promise<string>) =>
        operation({}),
      );

    await expect(
      runReviewTrialTransaction(
        async () => "committed",
        { $transaction: transaction },
        async () => undefined,
      ),
    ).resolves.toBe("committed");
    expect(transaction).toHaveBeenCalledTimes(4);
  });

  it("surfaces the fourth P2034 conflict without a fifth attempt", async () => {
    const conflict = { code: "P2034" };
    const transaction = vi.fn().mockRejectedValue(conflict);

    await expect(
      runReviewTrialTransaction(
        async () => "unreachable",
        { $transaction: transaction },
        async () => undefined,
      ),
    ).rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(4);
  });

  it("retries a PostgreSQL 40001 conflict wrapped by a raw Prisma query", async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2010", meta: { code: "40001" } })
      .mockImplementationOnce(async (operation: (client: object) => Promise<string>) =>
        operation({}),
      );

    await expect(
      runReviewTrialTransaction(
        async () => "committed",
        { $transaction: transaction },
        async () => undefined,
      ),
    ).resolves.toBe("committed");
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("releases one reserved credit once under the same execution fence", async () => {
    const { client, state, usage, usageUpdateMany } = createCreditHarness();

    await expect(releaseTrialCredit(FENCE, client)).resolves.toBe(true);
    await expect(releaseTrialCredit(FENCE, client)).resolves.toBe(false);

    expect(state.trialCreditState).toBe("RELEASED");
    expect(usage.count).toBe(0);
    expect(usageUpdateMany).toHaveBeenCalledOnce();
  });

  it("rejects a stale fence after a terminal transition clears the lease", async () => {
    const { client, state, usageUpdateMany } = createCreditHarness();
    state.status = "COMPLETED";
    state.executionLeaseToken = null;
    state.executionLeaseOwner = null;

    await expect(releaseTrialCredit(FENCE, client)).rejects.toBeInstanceOf(
      ReviewStateConflictError,
    );
    expect(usageUpdateMany).not.toHaveBeenCalled();
  });

  it("records the GitHub artifact while consuming a reserved credit", async () => {
    const { client, state, usageUpdateMany } = createCreditHarness();
    const postedAt = new Date("2026-08-29T01:00:00.000Z");

    await expect(
      consumeTrialCredit(
        {
          ...FENCE,
          githubMainReviewId: "github-review-42",
          postedAt,
        },
        client,
      ),
    ).resolves.toBe(true);

    expect(state).toMatchObject({
      trialCreditState: "CONSUMED",
      githubMainReviewId: "github-review-42",
      githubMainPostedAt: postedAt,
    });
    expect(usageUpdateMany).not.toHaveBeenCalled();
  });
});
