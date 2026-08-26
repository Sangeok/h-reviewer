import { randomUUID } from "node:crypto";

import {
  completeReviewExecution,
  recordGithubMainArtifact,
} from "@/features/review/lib/review-execution-state";
import {
  GITHUB_ARTIFACT_ABSENCE_GRACE_MS,
  REVIEW_EXECUTION_LEASE_MS,
} from "@/features/review/constants";
import { buildReviewArtifactMarker } from "@/features/review/lib/review-artifact-marker";
import prisma from "@/lib/db";
import {
  findGithubIssueCommentArtifact,
  findGithubMainReviewArtifact,
  type PostedGithubArtifact,
} from "@/lib/github/github-review-artifacts";

import { inngest } from "../client";

const RECONCILIATION_BATCH_SIZE = 50;
export const REVIEW_RECONCILIATION_CRON = "*/10 * * * *";

type ReconciliationStep = {
  run<T>(id: string, handler: () => Promise<T> | T): Promise<T>;
};

export type ReconcileStaleReviewExecutionsDependencies = {
  prisma: typeof prisma;
  findGithubMainReviewArtifact: typeof findGithubMainReviewArtifact;
  findGithubIssueCommentArtifact: typeof findGithubIssueCommentArtifact;
  now(): Date;
};

type ReconciliationCandidate = Awaited<
  ReturnType<typeof findReconciliationCandidates>
>[number];

function getLeaseExpiration(now: Date, milliseconds: number): Date {
  return new Date(now.getTime() + milliseconds);
}

async function findReconciliationCandidates(
  dependencies: ReconcileStaleReviewExecutionsDependencies,
) {
  const now = dependencies.now();
  return dependencies.prisma.review.findMany({
    where: {
      OR: [
        {
          status: { in: ["PENDING", "RUNNING", "POSTING"] },
          executionLeaseExpiresAt: { lte: now },
        },
        {
          status: "FAILED",
          failureStage: { in: ["POST", "RECONCILE"] },
          OR: [
            { executionLeaseExpiresAt: null },
            { executionLeaseExpiresAt: { lte: now } },
          ],
        },
        {
          status: "SUPERSEDED",
          trialCreditState: "RESERVED",
          OR: [
            { executionLeaseExpiresAt: null },
            { executionLeaseExpiresAt: { lte: now } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: RECONCILIATION_BATCH_SIZE,
    select: {
      id: true,
      status: true,
      attemptCount: true,
      reviewType: true,
      review: true,
      headSha: true,
      githubAuthorId: true,
      lastCompletedStage: true,
      artifactLookupMissedAt: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
      executionLeaseExpiresAt: true,
      prNumber: true,
      repository: {
        select: { owner: true, name: true, userId: true },
      },
    },
  });
}

async function acquireReconciliationLease(input: {
  dependencies: ReconcileStaleReviewExecutionsDependencies;
  candidate: ReconciliationCandidate;
}): Promise<string | null> {
  const now = input.dependencies.now();
  const leaseToken = randomUUID();
  const result = await input.dependencies.prisma.review.updateMany({
    where: {
      id: input.candidate.id,
      status: input.candidate.status,
      attemptCount: input.candidate.attemptCount,
      executionLeaseToken: input.candidate.executionLeaseToken,
      executionLeaseOwner: input.candidate.executionLeaseOwner,
      OR: [
        { executionLeaseExpiresAt: null },
        { executionLeaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      executionLeaseToken: leaseToken,
      executionLeaseOwner: "RECONCILER",
      executionLeaseExpiresAt: getLeaseExpiration(
        now,
        REVIEW_EXECUTION_LEASE_MS,
      ),
    },
  });
  return result.count === 1 ? leaseToken : null;
}

async function failWithoutArtifactLookup(input: {
  dependencies: ReconcileStaleReviewExecutionsDependencies;
  candidate: ReconciliationCandidate;
  leaseToken: string;
  message: string;
}): Promise<void> {
  await input.dependencies.prisma.review.updateMany({
    where: {
      id: input.candidate.id,
      status: input.candidate.status,
      attemptCount: input.candidate.attemptCount,
      executionLeaseToken: input.leaseToken,
      executionLeaseOwner: "RECONCILER",
    },
    data: {
      status: "FAILED",
      failureStage: "RECONCILE",
      failureMessage: input.message,
      artifactLookupMissedAt: null,
      executionLeaseToken: null,
      executionLeaseOwner: null,
      executionLeaseExpiresAt: null,
    },
  });
}

async function extendReconciliationLease(input: {
  dependencies: ReconcileStaleReviewExecutionsDependencies;
  candidate: ReconciliationCandidate;
  leaseToken: string;
}): Promise<void> {
  const now = input.dependencies.now();
  await input.dependencies.prisma.review.updateMany({
    where: {
      id: input.candidate.id,
      status: input.candidate.status,
      attemptCount: input.candidate.attemptCount,
      executionLeaseToken: input.leaseToken,
      executionLeaseOwner: "RECONCILER",
    },
    data: {
      executionLeaseExpiresAt: getLeaseExpiration(
        now,
        GITHUB_ARTIFACT_ABSENCE_GRACE_MS,
      ),
    },
  });
}

async function findTrustedPrimaryArtifact(input: {
  dependencies: ReconcileStaleReviewExecutionsDependencies;
  candidate: ReconciliationCandidate;
  token: string;
}): Promise<PostedGithubArtifact | null> {
  if (!input.candidate.headSha || !input.candidate.githubAuthorId) {
    throw new Error("Persisted GitHub identity is incomplete");
  }
  const marker = buildReviewArtifactMarker(
    input.candidate.id,
    input.candidate.reviewType === "SUMMARY" ? "summary" : "main",
  );
  const lookupInput = {
    token: input.token,
    owner: input.candidate.repository.owner,
    repo: input.candidate.repository.name,
    prNumber: input.candidate.prNumber,
    marker,
    expectedAuthorId: input.candidate.githubAuthorId,
    headSha: input.candidate.headSha,
  };
  return input.candidate.reviewType === "SUMMARY"
    ? input.dependencies.findGithubIssueCommentArtifact(lookupInput)
    : input.dependencies.findGithubMainReviewArtifact(lookupInput);
}

async function settleFoundArtifact(input: {
  dependencies: ReconcileStaleReviewExecutionsDependencies;
  candidate: ReconciliationCandidate;
  leaseToken: string;
  artifact: PostedGithubArtifact;
}): Promise<void> {
  await input.dependencies.prisma.$transaction(async (client) => {
    const now = input.dependencies.now();
    await recordGithubMainArtifact(
      {
        reviewId: input.candidate.id,
        attempt: input.candidate.attemptCount,
        leaseToken: input.leaseToken,
        leaseOwner: "RECONCILER",
        from: [input.candidate.status as "POSTING" | "FAILED" | "SUPERSEDED"],
        artifactId: input.artifact.id,
        postedAt: input.artifact.postedAt,
        now,
      },
      client,
    );

    if (input.candidate.status === "SUPERSEDED") {
      await client.review.updateMany({
        where: {
          id: input.candidate.id,
          status: "SUPERSEDED",
          attemptCount: input.candidate.attemptCount,
          executionLeaseToken: input.leaseToken,
          executionLeaseOwner: "RECONCILER",
        },
        data: {
          executionLeaseToken: null,
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
        },
      });
      return;
    }

    await completeReviewExecution(
      {
        reviewId: input.candidate.id,
        attempt: input.candidate.attemptCount,
        leaseToken: input.leaseToken,
        leaseOwner: "RECONCILER",
        from: [input.candidate.status as "POSTING" | "FAILED"],
        now,
      },
      client,
    );
  });
}

async function settleMissingArtifact(input: {
  dependencies: ReconcileStaleReviewExecutionsDependencies;
  candidate: ReconciliationCandidate;
  leaseToken: string;
}): Promise<void> {
  const now = input.dependencies.now();
  const firstMiss = input.candidate.artifactLookupMissedAt;
  if (
    firstMiss === null ||
    now.getTime() - firstMiss.getTime() < GITHUB_ARTIFACT_ABSENCE_GRACE_MS
  ) {
    await input.dependencies.prisma.review.updateMany({
      where: {
        id: input.candidate.id,
        status: input.candidate.status,
        attemptCount: input.candidate.attemptCount,
        executionLeaseToken: input.leaseToken,
        executionLeaseOwner: "RECONCILER",
      },
      data: {
        artifactLookupMissedAt: firstMiss ?? now,
        executionLeaseExpiresAt: getLeaseExpiration(
          firstMiss ?? now,
          GITHUB_ARTIFACT_ABSENCE_GRACE_MS,
        ),
      },
    });
    return;
  }

  if (input.candidate.status === "SUPERSEDED") {
    await input.dependencies.prisma.review.updateMany({
      where: {
        id: input.candidate.id,
        status: "SUPERSEDED",
        attemptCount: input.candidate.attemptCount,
        executionLeaseToken: input.leaseToken,
        executionLeaseOwner: "RECONCILER",
      },
      data: {
        artifactLookupMissedAt: null,
        executionLeaseToken: null,
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
      },
    });
    return;
  }

  await failWithoutArtifactLookup({
    ...input,
    message: "GitHub artifact was absent after two spaced marker lookups.",
  });
}

async function reconcileCandidate(input: {
  dependencies: ReconcileStaleReviewExecutionsDependencies;
  candidate: ReconciliationCandidate;
}): Promise<void> {
  const leaseToken = await acquireReconciliationLease(input);
  if (!leaseToken) return;

  if (input.candidate.review.trim().length === 0) {
    await failWithoutArtifactLookup({
      ...input,
      leaseToken,
      message: "Persisted review content is unavailable for reconciliation.",
    });
    return;
  }
  if (
    (input.candidate.status === "PENDING" ||
      input.candidate.status === "RUNNING") &&
    input.candidate.lastCompletedStage !== "PERSISTED"
  ) {
    await failWithoutArtifactLookup({
      ...input,
      leaseToken,
      message: "Review execution expired before durable persistence.",
    });
    return;
  }
  if (
    input.candidate.status === "PENDING" ||
    input.candidate.status === "RUNNING"
  ) {
    await failWithoutArtifactLookup({
      ...input,
      leaseToken,
      message: "Persisted review execution has an invalid active state.",
    });
    return;
  }

  const account = input.candidate.githubAuthorId
    ? await input.dependencies.prisma.account.findFirst({
        where: {
          accountId: input.candidate.githubAuthorId,
          userId: input.candidate.repository.userId,
          providerId: "github",
        },
        select: { accessToken: true },
      })
    : null;
  if (!account?.accessToken) {
    await extendReconciliationLease({ ...input, leaseToken });
    return;
  }

  let artifact: PostedGithubArtifact | null;
  try {
    artifact = await findTrustedPrimaryArtifact({
      ...input,
      token: account.accessToken,
    });
  } catch (error) {
    console.warn("GitHub artifact lookup could not be completed", {
      reviewId: input.candidate.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    await extendReconciliationLease({ ...input, leaseToken });
    return;
  }

  if (artifact) {
    await settleFoundArtifact({ ...input, leaseToken, artifact });
  } else {
    await settleMissingArtifact({ ...input, leaseToken });
  }
}

export function createReconcileStaleReviewExecutionsHandler(
  dependencies: ReconcileStaleReviewExecutionsDependencies,
): (input: { step: ReconciliationStep }) => Promise<{ processed: number }> {
  return async ({ step }) => {
    const candidates = await step.run("find-stale-review-executions", () =>
      findReconciliationCandidates(dependencies),
    );
    for (const candidate of candidates) {
      await step.run(`reconcile-review-${candidate.id}`, () =>
        reconcileCandidate({ dependencies, candidate }),
      );
    }
    return { processed: candidates.length };
  };
}

const defaultDependencies: ReconcileStaleReviewExecutionsDependencies = {
  prisma,
  findGithubMainReviewArtifact,
  findGithubIssueCommentArtifact,
  now: () => new Date(),
};

export const reconcileStaleReviewExecutions = inngest.createFunction(
  { id: "reconcile-stale-review-executions" },
  { cron: REVIEW_RECONCILIATION_CRON },
  createReconcileStaleReviewExecutionsHandler(defaultDependencies),
);
