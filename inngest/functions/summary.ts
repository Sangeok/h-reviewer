import { randomUUID } from "node:crypto";

import { google } from "@ai-sdk/google";
import { generateText } from "ai";

import { GENERATOR_MODEL_ID, stripFencedCodeBlocks } from "@/features/ai";
import {
  claimReviewExecution,
  checkpointReviewExecution,
  completeReviewExecution,
  recordGithubMainArtifact,
  renewReviewExecutionLease,
  transitionReviewExecution,
} from "@/features/review/lib/review-execution-state";
import { assertCurrentReviewHead } from "@/features/review/lib/review-head-guard";
import { getLanguageName, isValidLanguageCode } from "@/features/settings";
import prisma from "@/lib/db";
import { getPullRequestDiff, postReviewComment } from "@/lib/github/github";
import {
  GITHUB_ARTIFACT_ABSENCE_GRACE_MS,
  REVIEW_EXECUTION_LEASE_MS,
} from "@/features/review/constants";
import { buildReviewArtifactMarker } from "@/features/review/lib/review-artifact-marker";
import { buildGithubArtifactBody } from "@/lib/github/github-artifact-body";
import {
  findGithubIssueCommentArtifact,
  type PostedGithubArtifact,
} from "@/lib/github/github-review-artifacts";

import { inngest } from "../client";
import type { HReviewerEvents } from "../events";

export type SummaryWorkerEventData =
  HReviewerEvents["pr.summary.requested"]["data"];

export type SummaryWorkerStep = {
  run<T>(id: string, handler: () => Promise<T> | T): Promise<T>;
};

export type SummaryWorkerHandler = (input: {
  event: { data: SummaryWorkerEventData };
  step: SummaryWorkerStep;
}) => Promise<{ success: true }>;

export type SummaryWorkerDependencies = {
  prisma: typeof prisma;
  getPullRequestDiff: typeof getPullRequestDiff;
  postReviewComment: typeof postReviewComment;
  findGithubIssueCommentArtifact: typeof findGithubIssueCommentArtifact;
  generateText: typeof generateText;
  createGeneratorModel: typeof google;
  assertCurrentReviewHead: typeof assertCurrentReviewHead;
  now(): Date;
};

type ClaimedSummaryRequest = {
  id: string;
  attemptCount: number;
  headSha: string;
  githubAuthorId: string;
  langCode: string;
  prNumber: number;
  review: string;
  lastCompletedStage: string | null;
  artifactLookupMissedAt: Date | null;
  repository: {
    owner: string;
    name: string;
    userId: string;
  };
};

function getRenewedExecutionLease(now: Date): Date {
  return new Date(now.getTime() + REVIEW_EXECUTION_LEASE_MS);
}

async function markSummaryLookupMiss(input: {
  dependencies: SummaryWorkerDependencies;
  reviewId: string;
  attempt: number;
  leaseToken: string;
}): Promise<void> {
  const now = input.dependencies.now();
  const result = await input.dependencies.prisma.review.updateMany({
    where: {
      id: input.reviewId,
      status: "POSTING",
      attemptCount: input.attempt,
      executionLeaseToken: input.leaseToken,
      executionLeaseOwner: "WORKER",
      executionLeaseExpiresAt: { gt: now },
    },
    data: {
      status: "FAILED",
      failureStage: "POST",
      failureMessage: "GitHub summary result requires marker reconciliation.",
      artifactLookupMissedAt: now,
      executionLeaseToken: randomUUID(),
      executionLeaseOwner: "RECONCILER",
      executionLeaseExpiresAt: new Date(
        now.getTime() + GITHUB_ARTIFACT_ABSENCE_GRACE_MS,
      ),
    },
  });
  if (result.count !== 1) {
    throw new Error(`Summary ${input.reviewId} recovery fence was lost`);
  }
}

async function getBoundGithubToken(
  dependencies: SummaryWorkerDependencies,
  reviewRequest: ClaimedSummaryRequest,
): Promise<string> {
  const account = await dependencies.prisma.account.findFirst({
    where: {
      accountId: reviewRequest.githubAuthorId,
      userId: reviewRequest.repository.userId,
      providerId: "github",
    },
    select: { accessToken: true },
  });

  if (!account?.accessToken) {
    throw new Error("The persisted GitHub account binding is unavailable");
  }

  return account.accessToken;
}

async function assertAndRenewCurrentSummaryHead(input: {
  dependencies: SummaryWorkerDependencies;
  reviewRequest: ClaimedSummaryRequest;
  attempt: number;
  leaseToken: string;
  allowedStatuses: readonly ("RUNNING" | "POSTING")[];
}): Promise<void> {
  await input.dependencies.assertCurrentReviewHead({
    reviewId: input.reviewRequest.id,
    attempt: input.attempt,
    leaseToken: input.leaseToken,
    expectedHeadSha: input.reviewRequest.headSha,
    allowedStatuses: input.allowedStatuses,
  });
  await renewReviewExecutionLease(
    {
      reviewId: input.reviewRequest.id,
      attempt: input.attempt,
      leaseToken: input.leaseToken,
      leaseOwner: "WORKER",
      allowedStatuses: input.allowedStatuses,
      now: input.dependencies.now(),
    },
    input.dependencies.prisma,
  );
}

export function createGenerateSummaryHandler(
  dependencies: SummaryWorkerDependencies,
): SummaryWorkerHandler {
  return async ({ event, step }) => {
    const { reviewId, attempt } = event.data;
    const { leaseToken } = await step.run("claim-review", () =>
      claimReviewExecution(
        { reviewId, attempt, now: dependencies.now() },
        dependencies.prisma,
      ),
    );
    const reviewRequest = await step.run("load-review-request", async () => {
      const review = await dependencies.prisma.review.findUnique({
        where: { id: reviewId },
        select: {
          id: true,
          attemptCount: true,
          headSha: true,
          githubAuthorId: true,
          langCode: true,
          prNumber: true,
          review: true,
          lastCompletedStage: true,
          artifactLookupMissedAt: true,
          repository: {
            select: {
              owner: true,
              name: true,
              userId: true,
            },
          },
        },
      });

      if (
        !review ||
        !review.headSha ||
        !review.githubAuthorId ||
        review.attemptCount !== attempt
      ) {
        throw new Error("Claimed summary request data is incomplete");
      }

      return {
        ...review,
        headSha: review.headSha,
        githubAuthorId: review.githubAuthorId,
      } satisfies ClaimedSummaryRequest;
    });
    const owner = reviewRequest.repository.owner;
    const repo = reviewRequest.repository.name;
    const prNumber = reviewRequest.prNumber;

    const postingRecovery =
      reviewRequest.review.trim().length > 0 &&
      reviewRequest.lastCompletedStage !== null &&
      [
        "PERSISTED",
        "MAIN_POSTED",
        "INLINE_POSTED",
        "VERIFICATION_POSTED",
      ].includes(reviewRequest.lastCompletedStage)
        ? reviewRequest.artifactLookupMissedAt
          ? "LOOKUP_ONLY"
          : "REPOST_CONFIRMED_ABSENT"
        : null;

    if (postingRecovery) {
      const marker = buildReviewArtifactMarker(reviewId, "summary");
      if (postingRecovery === "REPOST_CONFIRMED_ABSENT") {
        try {
          buildGithubArtifactBody({
            content: reviewRequest.review,
            marker,
            title: "AI PR Summary",
          });
        } catch {
          await transitionReviewExecution(
            {
              reviewId,
              attempt,
              leaseToken,
              leaseOwner: "WORKER",
              now: dependencies.now(),
              from: ["RUNNING"],
              to: "FAILED",
              failure: {
                stage: "PERSIST",
                message: "Persisted summary exceeds the GitHub body budget.",
              },
            },
            dependencies.prisma,
          );
          return { success: true };
        }
      }

      await step.run("resume-summary-posting", () =>
        transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["RUNNING"],
            to: "POSTING",
            lastCompletedStage: "PERSISTED",
            leaseExpiresAt: getRenewedExecutionLease(dependencies.now()),
          },
          dependencies.prisma,
        ),
      );

      const artifact = await step.run(
        "recover-summary-artifact",
        async (): Promise<PostedGithubArtifact | null> => {
          const token = await getBoundGithubToken(dependencies, reviewRequest);
          await assertAndRenewCurrentSummaryHead({
            dependencies,
            reviewRequest,
            attempt,
            leaseToken,
            allowedStatuses: ["POSTING"],
          });
          const existing = await dependencies.findGithubIssueCommentArtifact({
            token,
            owner,
            repo,
            prNumber,
            marker,
            expectedAuthorId: reviewRequest.githubAuthorId,
            headSha: reviewRequest.headSha,
          });
          if (existing) return existing;
          if (postingRecovery === "LOOKUP_ONLY") {
            await markSummaryLookupMiss({
              dependencies,
              reviewId,
              attempt,
              leaseToken,
            });
            return null;
          }
          return dependencies.postReviewComment({
            token,
            owner,
            repo,
            prNumber,
            content: reviewRequest.review,
            marker,
            title: "AI PR Summary",
          });
        },
      );
      if (!artifact) return { success: true };

      await step.run("complete-recovered-summary", async () => {
        await recordGithubMainArtifact(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            from: ["POSTING"],
            artifactId: artifact.id,
            postedAt: artifact.postedAt,
            now: dependencies.now(),
          },
          dependencies.prisma,
        );
        await completeReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            from: ["POSTING"],
            now: dependencies.now(),
          },
          dependencies.prisma,
        );
      });
      return { success: true };
    }

    const pullRequest = await step.run("fetch-pr-data", async () => {
      await renewReviewExecutionLease(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["RUNNING"],
          now: dependencies.now(),
        },
        dependencies.prisma,
      );

      try {
        const token = await getBoundGithubToken(dependencies, reviewRequest);
        const data = await dependencies.getPullRequestDiff({
          token,
          owner,
          repo,
          prNumber,
        });

        await checkpointReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            allowedStatuses: ["RUNNING"],
            now: dependencies.now(),
            stage: "FETCHED",
          },
          dependencies.prisma,
        );

        return data;
      } catch {
        await transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["RUNNING"],
            to: "FAILED",
            failure: {
              stage: "FETCH",
              message: "Pull request data could not be fetched.",
            },
          },
          dependencies.prisma,
        );
        return null;
      }
    });

    if (!pullRequest) {
      return { success: true };
    }

    const { diff, title, description, headSha } = pullRequest;
    const summary = await step.run("generate-ai-summary", async () => {
      await assertAndRenewCurrentSummaryHead({
        dependencies,
        reviewRequest,
        attempt,
        leaseToken,
        allowedStatuses: ["RUNNING"],
      });
      const langCode = isValidLanguageCode(reviewRequest.langCode)
        ? reviewRequest.langCode
        : "en";
      const languageInstruction =
        langCode !== "en"
          ? `\n\nIMPORTANT: Write the entire summary in ${getLanguageName(
              langCode,
            )}. Keep section headers in English, but write all content in ${getLanguageName(langCode)}.`
          : "";
      const prompt = `You are an expert code reviewer. Produce a concise PR summary for a GitHub comment.${languageInstruction}

        Rules:
        - Use ONLY information present in the PR title, description, and diff. Do NOT guess.
        - Do NOT include any fenced code blocks (no triple backticks) in your response.
        - Do NOT quote code from the diff. Mention file paths only when helpful.
        - If something is unclear, write "Needs verification" rather than speculating.
        - Keep it short and useful for reviewers. Maximum 300 words.

        Output format (Markdown, EXACT sections, no extra preamble or closing text):
        1. Overview
        <2-3 sentences>

        2. Key Changes
        - <file path>: <one short sentence>
        (3-5 bullets max)

        3. Impact
        <1-3 sentences or bullets describing affected modules/user flows. If negligible, say so explicitly.>

        4. Risk Level
        <LOW|MEDIUM|HIGH> - <one sentence justification>

        PR Title: ${title}
        PR Description: ${description || "No description provided"}

        Code Changes (diff):
        \`\`\`diff
        ${diff}
        \`\`\``;

      const { text } = await dependencies.generateText({
        model: dependencies.createGeneratorModel(GENERATOR_MODEL_ID),
        prompt,
      });
      const sanitized = stripFencedCodeBlocks(text);
      const generatedSummary = sanitized.length > 0 ? sanitized : text.trim();
      await checkpointReviewExecution(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["RUNNING"],
          now: dependencies.now(),
          stage: "GENERATED",
        },
        dependencies.prisma,
      );
      return generatedSummary;
    });

    const marker = buildReviewArtifactMarker(reviewId, "summary");
    const persisted = await step.run("persist-summary-before-post", async () => {
      try {
        buildGithubArtifactBody({
          content: summary,
          marker,
          title: "AI PR Summary",
        });
      } catch {
        await transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["RUNNING"],
            to: "FAILED",
            failure: {
              stage: "PERSIST",
              message: "Summary content exceeds the GitHub body budget.",
            },
          },
          dependencies.prisma,
        );
        return false;
      }

      await dependencies.prisma.$transaction(async (client) => {
        await client.review.update({
          where: { id: reviewId },
          data: { prTitle: title, review: summary, headSha },
        });
        const transitionTime = dependencies.now();
        await transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: transitionTime,
            from: ["RUNNING"],
            to: "POSTING",
            lastCompletedStage: "PERSISTED",
            leaseExpiresAt: getRenewedExecutionLease(transitionTime),
          },
          client,
        );
      });
      return true;
    });
    if (!persisted) return { success: true };

    const persistedSummary = await step.run("load-persisted-summary", async () => {
      const review = await dependencies.prisma.review.findUnique({
        where: { id: reviewId },
        select: { review: true },
      });
      if (!review || review.review.trim().length === 0) {
        throw new Error("Persisted summary is unavailable for posting");
      }
      return review.review;
    });

    await step.run("post-comment", async () => {
      const token = await getBoundGithubToken(dependencies, reviewRequest);
      await assertAndRenewCurrentSummaryHead({
        dependencies,
        reviewRequest,
        attempt,
        leaseToken,
        allowedStatuses: ["POSTING"],
      });
      const artifact =
        (await dependencies.findGithubIssueCommentArtifact({
          token,
          owner,
          repo,
          prNumber,
          marker,
          expectedAuthorId: reviewRequest.githubAuthorId,
          headSha: reviewRequest.headSha,
        })) ??
        (await dependencies.postReviewComment({
          token,
          owner,
          repo,
          prNumber,
          content: persistedSummary,
          marker,
          title: "AI PR Summary",
        }));
      await recordGithubMainArtifact(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          from: ["POSTING"],
          artifactId: artifact.id,
          postedAt: artifact.postedAt,
          now: dependencies.now(),
        },
        dependencies.prisma,
      );
    });

    await step.run("complete-summary", () =>
      completeReviewExecution(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          from: ["POSTING"],
          now: dependencies.now(),
        },
        dependencies.prisma,
      ),
    );

    return { success: true };
  };
}

function buildSafeSummaryFailureMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : null;
  return [name, status === null ? null : `status=${status}`]
    .filter((part): part is string => part !== null)
    .join("; ")
    .slice(0, 1_000);
}

export async function handleSummaryFailure(input: {
  event: { data: { event: { data?: unknown } } };
  error: unknown;
}): Promise<void> {
  const originalData = input.event.data.event.data;
  if (typeof originalData !== "object" || originalData === null) return;
  const reviewId =
    "reviewId" in originalData && typeof originalData.reviewId === "string"
      ? originalData.reviewId
      : null;
  const attempt =
    "attempt" in originalData &&
    typeof originalData.attempt === "number" &&
    Number.isInteger(originalData.attempt)
      ? originalData.attempt
      : null;
  if (!reviewId || attempt === null) return;

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      status: true,
      attemptCount: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
      lastCompletedStage: true,
    },
  });
  if (
    !review ||
    review.attemptCount !== attempt ||
    !["PENDING", "RUNNING", "POSTING"].includes(review.status) ||
    !review.executionLeaseToken
  ) {
    return;
  }

  const status = review.status as "PENDING" | "RUNNING" | "POSTING";
  const expectedOwner = status === "PENDING" ? "QUEUE" : "WORKER";
  if (review.executionLeaseOwner !== expectedOwner) return;
  const stage =
    status === "PENDING"
      ? "QUEUE"
      : status === "POSTING"
        ? "POST"
        : review.lastCompletedStage === "GENERATED"
          ? "PERSIST"
          : "GENERATE";
  const now = new Date();
  await prisma.review.updateMany({
    where: {
      id: reviewId,
      status,
      attemptCount: attempt,
      executionLeaseToken: review.executionLeaseToken,
      executionLeaseOwner: expectedOwner,
    },
    data: {
      status: "FAILED",
      failureStage: stage,
      failureMessage: buildSafeSummaryFailureMessage(input.error),
      ...(stage === "POST"
        ? {
            executionLeaseToken: randomUUID(),
            executionLeaseOwner: "RECONCILER" as const,
            executionLeaseExpiresAt: now,
          }
        : {
            executionLeaseToken: null,
            executionLeaseOwner: null,
            executionLeaseExpiresAt: null,
          }),
    },
  });
}

const defaultSummaryWorkerDependencies: SummaryWorkerDependencies = {
  prisma,
  getPullRequestDiff,
  postReviewComment,
  findGithubIssueCommentArtifact,
  generateText,
  createGeneratorModel: google,
  assertCurrentReviewHead,
  now: () => new Date(),
};

export const generateSummary = inngest.createFunction(
  {
    id: "generate-summary",
    onFailure: handleSummaryFailure,
    cancelOn: [
      {
        event: "pr.review.superseded",
        if:
          "async.data.reviewId == event.data.reviewId && " +
          "async.data.attempt == event.data.attempt",
      },
    ],
  },
  { event: "pr.summary.requested" },
  createGenerateSummaryHandler(defaultSummaryWorkerDependencies),
);
