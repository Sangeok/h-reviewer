import { inngest } from "@/inngest/client";
import { getUserLanguageByUserId } from "@/module/settings";
import { getRepositoryWithToken } from "../lib/get-repository-with-token";

export async function generatePRSummary(owner: string, repo: string, prNumber: number) {
  try {
    const { repository } = await getRepositoryWithToken(owner, repo);
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

    return {
      success: true,
      message: "Summary Queued",
    };
  } catch (error) {
    console.error("Error queueing PR summary:", error);

    return {
      success: false,
      message: "Error Queueing Summary",
    };
  }
}
