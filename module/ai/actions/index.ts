import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { getPullRequestDiff } from "@/module/github/lib/github";

export async function reviewPullRequest(owner: string, repo: string, prNumber: number) {
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

    const accessToken = githubAccount.accessToken;

    const { title } = await getPullRequestDiff(accessToken, owner, repo, prNumber);

    await inngest.send({
      name: "pr.review.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
      },
    });

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
      return {
        success: false,
        message: "Error Reviewing Pull Request",
      };
    } catch (error) {
      console.error("Error reviewing pull request:", error);
      return {
        success: false,
        message: "Error Reviewing Pull Request",
      };
    }
  }
}
