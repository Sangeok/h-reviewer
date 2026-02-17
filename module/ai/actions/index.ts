import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { getPullRequestDiff } from "@/module/github";
import { getUserLanguageByUserId } from "@/module/settings";
import { canCreateReview, incrementReviewCount } from "@/module/payment/lib/subscription";

type ReviewPullRequestResult =
  | {
      success: true;
      message: "Review Queued";
    }
  | {
      success: false;
      message: string;
      reason: "plan_restricted" | "internal_error";
    };

export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ReviewPullRequestResult> {
  try {
    const repository = await prisma.repository.findFirst({
      where: {
        owner,
        name: repo,
      },
      include: {
        user: {
          include: {
            accounts: {
              where: {
                providerId: "github",
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const canReview = await canCreateReview(repository.user.id, repository.id);

    if (!canReview) {
      return {
        success: false,
        message: "Review creation is available on the Pro plan only",
        reason: "plan_restricted",
      };
    }

    const githubAccount = repository.user.accounts[0];

    if (!githubAccount?.accessToken) {
      throw new Error("Github access token not found");
    }

    const accessToken = githubAccount.accessToken;

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
    try {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (repository) {
        await prisma.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: "Failed to fetch PR",
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review: `Error : ${error instanceof Error ? error.message : "Unknown error"}`,
            status: "failed",
          },
        });
      }
    } catch (loggingError) {
      console.error("Error writing failed review record:", loggingError);
    }

    return {
      success: false,
      message: "Error Reviewing Pull Request",
      reason: "internal_error",
    };
  }
}

export async function generatePRSummary(owner: string, repo: string, prNumber: number) {
  try {
    const repository = await prisma.repository.findFirst({
      where: {
        owner,
        name: repo,
      },
      include: {
        user: {
          include: {
            accounts: {
              where: {
                providerId: "github",
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const githubAccount = repository.user.accounts[0];

    if (!githubAccount?.accessToken) {
      throw new Error("Github access token not found");
    }

    const preferredLanguage = await getUserLanguageByUserId(repository.user.id);

    await inngest.send({
      name: "pr.summary.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
        preferredLanguage,
      },
    });

    return { success: true, message: "Summary Queued" };
  } catch (error) {
    console.error("Error queueing PR summary:", error);
    return { success: false, message: "Error Queueing Summary" };
  }
}
