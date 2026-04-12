"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";
import { getFileContent, commitFileUpdate, getPullRequestBranch } from "@/module/github/lib/github";
import type { ApplySuggestionResult } from "../types";

/**
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
    const prInfo = await getPullRequestBranch(account.accessToken, owner, repo, prNumber);

    const prStatusError = validatePrStatus(prInfo);
    if (prStatusError) return prStatusError;

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

    const updatedContent = applyCodeChange(
      fileData.content,
      suggestion.beforeCode,
      suggestion.afterCode,
      suggestion.lineNumber,
    );

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

function validatePrStatus(prInfo: { merged: boolean; state: string }): ApplySuggestionResult | null {
  if (prInfo.merged) return { success: false, error: "PR is already merged", reason: "pr_merged" };
  if (prInfo.state !== "open") return { success: false, error: "PR is closed", reason: "conflict" };
  return null;
}

function applyCodeChange(
  fileContent: string,
  beforeCode: string,
  afterCode: string,
  lineNumber: number,
): string {
  const originalContent = fileContent.replace(/\r\n/g, "\n");
  const originalBefore = beforeCode.replace(/\r\n/g, "\n");
  const originalAfter = afterCode.replace(/\r\n/g, "\n");

  if (originalContent.includes(originalBefore)) {
    return replaceNearestOccurrence(originalContent, originalBefore, originalAfter, lineNumber);
  }

  // flex regex fallback: 후행 공백 정규화 후 패턴 매칭
  const normalizedBefore = originalBefore.replace(/[ \t]+$/gm, "");
  const escaped = normalizedBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexPattern = escaped.split('\n').map(line => line + '[ \\t]*').join('\\n');
  const regex = new RegExp(flexPattern, 'g');

  const matches: { index: number; length: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(originalContent)) !== null) {
    matches.push({ index: match.index, length: match[0].length });
    regex.lastIndex = match.index + 1;
  }

  if (matches.length === 0) return originalContent;

  const lineOfIndex = (idx: number) => originalContent.slice(0, idx).split("\n").length;
  let best = matches[0];
  let bestDist = Math.abs(lineOfIndex(best.index) - lineNumber);
  for (let i = 1; i < matches.length; i++) {
    const dist = Math.abs(lineOfIndex(matches[i].index) - lineNumber);
    if (dist < bestDist) { bestDist = dist; best = matches[i]; }
  }
  return originalContent.slice(0, best.index) + originalAfter + originalContent.slice(best.index + best.length);
}

function truncate(text: string, maxLength: number): string {
  const singleLine = text.replace(/\n/g, " ").trim();
  return singleLine.length <= maxLength ? singleLine : singleLine.slice(0, maxLength - 3) + "...";
}

function replaceNearestOccurrence(
  content: string,
  before: string,
  after: string,
  targetLine: number,
): string {
  const indices: number[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = content.indexOf(before, searchFrom);
    if (idx === -1) break;
    indices.push(idx);
    searchFrom = idx + 1;
  }

  if (indices.length === 0) return content;
  if (indices.length === 1) {
    return content.slice(0, indices[0]) + after + content.slice(indices[0] + before.length);
  }

  const lineOfIndex = (idx: number) => content.slice(0, idx).split("\n").length;
  let bestIdx = indices[0];
  let bestDist = Math.abs(lineOfIndex(indices[0]) - targetLine);

  for (let i = 1; i < indices.length; i++) {
    const dist = Math.abs(lineOfIndex(indices[i]) - targetLine);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = indices[i];
    }
  }

  return content.slice(0, bestIdx) + after + content.slice(bestIdx + before.length);
}
