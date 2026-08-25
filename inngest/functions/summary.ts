import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/lib/github/github";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { stripFencedCodeBlocks, GENERATOR_MODEL_ID } from "@/features/ai";
import { getLanguageName, isValidLanguageCode } from "@/features/settings";

export type SummaryWorkerEventData = {
  owner: string;
  repo: string;
  prNumber: number;
  userId: string;
  preferredLanguage?: string;
};

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
};

export function createGenerateSummaryHandler(
  dependencies: SummaryWorkerDependencies,
): SummaryWorkerHandler {
  return async ({ event, step }) => {
    const { owner, repo, prNumber, userId, preferredLanguage = "en" } = event.data;

    // Fetch PR data
    const { diff, title, description, token } = await step.run("fetch-pr-data", async () => {
      const account = await dependencies.prisma.account.findFirst({
        where: {
          userId,
          providerId: "github",
        },
      });

      if (!account?.accessToken) {
        throw new Error("Github access token not found");
      }

      const data = await dependencies.getPullRequestDiff({
        token: account.accessToken,
        owner,
        repo,
        prNumber,
      });

      return { ...data, token: account.accessToken };
    });

    // Generate AI summary
    const summary = await step.run("generate-ai-summary", async () => {
      // Validate language code and generate language instruction
      const langCode = isValidLanguageCode(preferredLanguage) ? preferredLanguage : "en";
      const languageInstruction =
        langCode !== "en"
          ? `\n\nIMPORTANT: Write the entire summary in ${getLanguageName(
              langCode
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

    // Step 3: Post comment to GitHub
    await step.run("post-comment", async () => {
      await dependencies.postReviewComment(
        token,
        owner,
        repo,
        prNumber,
        summary,
        { title: "AI PR Summary" },
      );
    });

    // Step 4: Save to database
    await step.run("save-summary", async () => {
      const repository = await dependencies.prisma.repository.findFirst({
        where: { owner, name: repo },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      await dependencies.prisma.review.create({
        data: {
          repositoryId: repository.id,
          prNumber,
          prTitle: title,
          prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          review: summary,
          reviewType: "SUMMARY", // Summary 타입 명시
          status: "completed",
        },
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
};

export const generateSummary = inngest.createFunction(
  { id: "generate-summary" },
  { event: "pr.summary.requested" },
  createGenerateSummaryHandler(defaultSummaryWorkerDependencies),
);
