"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";
import { getFileContent, commitFileUpdate, getPullRequestHeadInfo } from "@/module/github/lib/github";
import { applyCodeChange } from "@/module/suggestion/lib/apply-code-change";
import type { ApplySuggestionResult } from "../types";

/**
 * look up suggestion by review id
 * 특정 리뷰의 모든 suggestion을 조회한다.
 */
export async function getSuggestionsByReviewId(reviewId: string) {
  const session = await requireAuthSession();

  return prisma.suggestion.findMany({
    where: {
      reviewId,
      review: {
        repository: { userId: session.user.id },
      },
    },
    orderBy: [
      { severity: "asc" },
      { lineNumber: "asc" },
    ],
  });
}

/**
 * apply suggestion
 * suggestion을 PR 브랜치에 적용한다.
 */
export async function applySuggestion(suggestionId: string): Promise<ApplySuggestionResult> {
  const session = await requireAuthSession();

  const suggestion = await prisma.suggestion.findFirst({
    where: {
      id: suggestionId,
      review: {
        repository: { userId: session.user.id },
      },
    },
    include: {
      review: {
        include: {
          repository: true,
        },
      },
    },
  });

  if (!suggestion) {
    return { success: false, error: "Suggestion not found", reason: "not_found" };
  }

  if (suggestion.status !== "PENDING") {
    return { success: false, error: `Suggestion already ${suggestion.status.toLowerCase()}`, reason: "conflict" };
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "github" },
  });

  if (!account?.accessToken) {
    return { success: false, error: "GitHub access token not found", reason: "unauthorized" };
  }

  const { owner, name: repo } = suggestion.review.repository;
  const { prNumber } = suggestion.review;

  try {
    const prInfo = await getPullRequestHeadInfo(account.accessToken, owner, repo, prNumber);

    const prStatusError = checkPrStatus(prInfo);
    if (prStatusError === "ALREADY_MERGED") {
      return { success: false, error: "PR is already merged", reason: "pr_merged" };
    }
    if (prStatusError === "CLOSED") {
      return { success: false, error: "PR is closed", reason: "conflict" };
    }

    const targetOwner = prInfo.headRepoOwner;
    const targetRepo = prInfo.headRepoName;

    const fileData = await getFileContent({
      token: account.accessToken,
      owner: targetOwner,
      repo: targetRepo,
      path: suggestion.filePath,
      ref: prInfo.branch,
    });

    if (!fileData) {
      return { success: false, error: "File not found on PR branch", reason: "not_found" };
    }

    // 충돌 감지: DB side effect는 오케스트레이터에 유지
    const normalizeWhitespace = (s: string) =>
      s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");

    if (!normalizeWhitespace(fileData.content).includes(normalizeWhitespace(suggestion.beforeCode))) {
      await prisma.suggestion.update({
        where: { id: suggestionId },
        data: { status: "CONFLICTED" },
      });
      return { success: false, error: "Code has changed since review", reason: "conflict" };
    }

    const { content: updatedContent } = applyCodeChange({
      fileContent: fileData.content,
      beforeCode: suggestion.beforeCode,
      afterCode: suggestion.afterCode,
      lineNumber: suggestion.lineNumber,
      strict: false,
    });

    const commitMessage = `refactor: ${truncate(suggestion.explanation, 72)}\n\nApplied via HReviewer one-click fix`;
    const { commitSha } = await commitFileUpdate({
      token: account.accessToken,
      owner: targetOwner,
      repo: targetRepo,
      path: suggestion.filePath,
      content: updatedContent,
      fileSha: fileData.sha,
      message: commitMessage,
      branch: prInfo.branch,
    });

    // Optimistic lock: PENDING인 경우에만 갱신
    const { count } = await prisma.suggestion.updateMany({
      where: { id: suggestionId, status: "PENDING" },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        appliedCommitSha: commitSha,
        appliedSource: "INTERNAL_APPLY_FIX",
      },
    });

    if (count === 0) {
      return { success: false, error: "Suggestion was already processed by another request", reason: "conflict" };
    }

    return { success: true, commitSha };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to apply suggestion:", error);
    return { success: false, error: message, reason: "api_error" };
  }
}

/**
 * dismiss suggestion
 */
export async function dismissSuggestion(suggestionId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuthSession();

  const suggestion = await prisma.suggestion.findFirst({
    where: {
      id: suggestionId,
      status: "PENDING",
      review: {
        repository: { userId: session.user.id },
      },
    },
  });

  if (!suggestion) {
    return { success: false, error: "Suggestion not found or already processed" };
  }

  const { count } = await prisma.suggestion.updateMany({
    where: { id: suggestionId, status: "PENDING" },
    data: {
      status: "DISMISSED",
      dismissedAt: new Date(),
    },
  });

  if (count === 0) {
    return { success: false, error: "Suggestion was already processed by another request" };
  }

  return { success: true };
}

// — Helpers —

type PrStatusError = "ALREADY_MERGED" | "CLOSED" | null;

function checkPrStatus(prInfo: { merged: boolean; state: string }): PrStatusError {
  if (prInfo.merged) return "ALREADY_MERGED";
  if (prInfo.state !== "open") return "CLOSED";
  return null;
}

function truncate(text: string, maxLength: number): string {
  const singleLine = text.replace(/\n/g, " ").trim();
  return singleLine.length <= maxLength ? singleLine : singleLine.slice(0, maxLength - 3) + "...";
}
