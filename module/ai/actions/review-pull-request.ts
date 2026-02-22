import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { getPullRequestDiff } from "@/module/github";
import { canCreateReview, incrementReviewCount } from "@/module/payment/lib/subscription";
import { getUserLanguageByUserId } from "@/module/settings";
import { buildPRUrl } from "../constants";
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

    await getPullRequestDiff(accessToken, owner, repo, prNumber);

    const preferredLanguage = await getUserLanguageByUserId(repository.user.id);

    await inngest.send({
      name: "pr.review.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
        preferredLanguage,
      },
    });

    await incrementReviewCount(repository.user.id, repository.id);

    return {
      success: true,
      message: "Review Queued",
    };
  } catch (error) {
    await createFailedReviewRecord(owner, repo, prNumber, error);

    return {
      success: false,
      message: "Error Reviewing Pull Request",
      reason: "internal_error",
    };
  }
}

async function createFailedReviewRecord(owner: string, repo: string, prNumber: number, error: unknown) {
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
        review: `Error : ${error instanceof Error ? error.message : "Unknown error"}`,
        status: "failed",
      },
    });
  } catch (loggingError) {
    console.error("Error writing failed review record:", loggingError);
  }
}
