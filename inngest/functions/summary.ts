import { google } from "@ai-sdk/google";
import { generateText } from "ai";

import { GENERATOR_MODEL_ID, stripFencedCodeBlocks } from "@/features/ai";
import {
  claimReviewExecution,
  renewReviewExecutionLease,
  transitionReviewExecution,
} from "@/features/review/lib/review-execution-state";
import { assertCurrentReviewHead } from "@/features/review/lib/review-head-guard";
import { getLanguageName, isValidLanguageCode } from "@/features/settings";
import prisma from "@/lib/db";
import { getPullRequestDiff, postReviewComment } from "@/lib/github/github";

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
  repository: {
    owner: string;
    name: string;
    userId: string;
  };
};

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
      return sanitized.length > 0 ? sanitized : text.trim();
    });

    await step.run("mark-summary-posting", () =>
      transitionReviewExecution(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          now: dependencies.now(),
          from: ["RUNNING"],
          to: "POSTING",
          lastCompletedStage: "GENERATED",
        },
        dependencies.prisma,
      ),
    );

    await step.run("post-comment", async () => {
      const token = await getBoundGithubToken(dependencies, reviewRequest);
      await assertAndRenewCurrentSummaryHead({
        dependencies,
        reviewRequest,
        attempt,
        leaseToken,
        allowedStatuses: ["POSTING"],
      });
      await dependencies.postReviewComment(
        token,
        owner,
        repo,
        prNumber,
        summary,
        { title: "AI PR Summary" },
      );
    });

    await step.run("save-summary", async () => {
      await renewReviewExecutionLease(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["POSTING"],
          now: dependencies.now(),
        },
        dependencies.prisma,
      );

      await dependencies.prisma.$transaction(async (client) => {
        await client.review.update({
          where: { id: reviewId },
          data: {
            prTitle: title,
            review: summary,
            headSha,
          },
        });
        await transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["POSTING"],
            to: "COMPLETED",
            lastCompletedStage: "PERSISTED",
          },
          client,
        );
      });
    });

    return { success: true };
  };
}

const defaultSummaryWorkerDependencies: SummaryWorkerDependencies = {
  prisma,
  getPullRequestDiff,
  postReviewComment,
  generateText,
  createGeneratorModel: google,
  assertCurrentReviewHead,
  now: () => new Date(),
};

export const generateSummary = inngest.createFunction(
  {
    id: "generate-summary",
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
