import { randomUUID } from "node:crypto";

import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { getPullRequestDiff } from "@/lib/github";
import { canCreateReview, incrementReviewCount } from "@/features/payment/lib/subscription";
import { getUserLanguageByUserId } from "@/features/settings";
import { buildPRUrl } from "../utils";
import { getRepositoryWithToken } from "../lib/get-repository-with-token";
import { type ReviewPullRequestResult } from "../types";

export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ReviewPullRequestResult> {
  try {
    const { repository, accessToken } = await getRepositoryWithToken(owner, repo);
    const canReview = await canCreateReview(repository.user.id, repository.id);

    if (!canReview) {
      return {
        success: false,
        message: "Review creation is available on the Pro plan only",
        reason: "plan_restricted",
      };
    }

    await getPullRequestDiff({ token: accessToken, owner, repo, prNumber });

    const preferredLanguage = await getUserLanguageByUserId(repository.user.id);

    await inngest.send({
      name: "pr.review.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
        preferredLanguage,
        maxSuggestions: repository.user.maxSuggestions ?? null,
        verificationEnabled: repository.user.verificationEnabled,
      },
    });

    await incrementReviewCount(repository.user.id, repository.id);

    return {
      success: true,
      message: "Review Queued",
    };
  } catch {
    await createFailedReviewRecord({ owner, repo, prNumber });

    return {
      success: false,
      message: "Error Reviewing Pull Request",
      reason: "internal_error",
    };
  }
}

type CreateFailedReviewRecordInput = {
  owner: string;
  repo: string;
  prNumber: number;
};

async function createFailedReviewRecord({
  owner,
  repo,
  prNumber,
}: CreateFailedReviewRecordInput): Promise<void> {
  try {
    const repository = await prisma.repository.findFirst({
      where: {
        owner,
        name: repo,
      },
    });

    if (!repository) {
      return;
    }

    await prisma.review.create({
      data: {
        repositoryId: repository.id,
        prNumber,
        prTitle: "Failed to fetch PR",
        prUrl: buildPRUrl(owner, repo, prNumber),
        review: "The review could not be queued. Retry the review from the pull request page.",
        requestKey: `legacy-runtime:${randomUUID()}`,
        requestSource: "LEGACY",
        reviewMode: "FULL",
        status: "FAILED",
        failureStage: "LEGACY",
        failureMessage: "The review request could not be prepared.",
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
      },
    });
  } catch (loggingError) {
    console.error("Error writing failed review record:", loggingError);
  }
}
