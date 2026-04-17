import prisma from "@/lib/db";
import { getCompareFiles, getFileContent } from "@/module/github/lib/github";
import { matchSuggestionsAgainstCompare, type MatchResult } from "./match-suggestions-against-compare";

type ReconcileParams = {
  token: string;
  headOwner: string;
  headRepoName: string;
  baseRepositoryId: string;
  prNumber: number;
  beforeSha: string;
  afterSha: string;
};

type ReconcileFailResult = {
  matchedSuggestionIds: [];
  matchedFilePaths: [];
  unaccountedFilePaths: string[];
  ambiguousFilePaths: [];
  skipReview: false;
  reason:
    | "no_matching_review"
    | "no_pending_suggestions"
    | "compare_api_failed"
    | "content_api_failed";
};

export type NativeSuggestionReconciliationResult = MatchResult | ReconcileFailResult;

function failResult(reason: ReconcileFailResult["reason"]): ReconcileFailResult {
  return {
    matchedSuggestionIds: [],
    matchedFilePaths: [],
    unaccountedFilePaths: [],
    ambiguousFilePaths: [],
    skipReview: false,
    reason,
  };
}

const MAX_FILE_SIZE = 1024 * 1024;

export async function reconcileNativeSuggestions(
  params: ReconcileParams,
): Promise<NativeSuggestionReconciliationResult> {
  const { token, headOwner, headRepoName, baseRepositoryId, prNumber, beforeSha, afterSha } = params;

  const review = await prisma.review.findFirst({
    where: { repositoryId: baseRepositoryId, prNumber, headSha: beforeSha },
    orderBy: { createdAt: "desc" },
  });

  if (!review) return failResult("no_matching_review");

  const pendingSuggestions = await prisma.suggestion.findMany({
    where: { reviewId: review.id, status: "PENDING" },
    select: { id: true, filePath: true, lineNumber: true, beforeCode: true, afterCode: true },
  });

  if (pendingSuggestions.length === 0) return failResult("no_pending_suggestions");

  let rawFiles: Awaited<ReturnType<typeof getCompareFiles>>;
  try {
    rawFiles = await getCompareFiles({
      token,
      owner: headOwner,
      repo: headRepoName,
      base: beforeSha,
      head: afterSha,
    });
  } catch (error) {
    console.error(
      `reconcileNativeSuggestions: compare_api_failed ${headOwner}/${headRepoName} ${beforeSha}..${afterSha}`,
      error,
    );
    return failResult("compare_api_failed");
  }

  const startTime = Date.now();
  console.info(
    `reconcileNativeSuggestions: start ${headOwner}/${headRepoName} PR#${prNumber}, files=${rawFiles.length}`,
  );

  type FileWithContent = {
    path: string;
    status: string;
    beforeContent: string | null;
    afterContent: string | null;
  };

  const compareFiles: FileWithContent[] = [];

  try {
    for (const file of rawFiles) {
      if (file.status === "removed" || file.status === "renamed") {
        compareFiles.push({ path: file.path, status: file.status, beforeContent: null, afterContent: null });
        continue;
      }

      const [before, after] = await Promise.all([
        getFileContent({ token, owner: headOwner, repo: headRepoName, path: file.path, ref: beforeSha }),
        getFileContent({ token, owner: headOwner, repo: headRepoName, path: file.path, ref: afterSha }),
      ]);

      let beforeContent = before?.content ?? null;
      let afterContent = after?.content ?? null;

      if (beforeContent !== null && Buffer.byteLength(beforeContent, "utf-8") > MAX_FILE_SIZE) {
        console.warn(`reconcileNativeSuggestions: file size exceeded ${file.path} (before)`);
        beforeContent = null;
      }
      if (afterContent !== null && Buffer.byteLength(afterContent, "utf-8") > MAX_FILE_SIZE) {
        console.warn(`reconcileNativeSuggestions: file size exceeded ${file.path} (after)`);
        afterContent = null;
      }

      compareFiles.push({ path: file.path, status: file.status, beforeContent, afterContent });
    }
  } catch (error) {
    console.error(`reconcileNativeSuggestions: content_api_failed ${headOwner}/${headRepoName}`, error);
    return failResult("content_api_failed");
  }

  const result = matchSuggestionsAgainstCompare({ compareFiles, pendingSuggestions });

  console.info(
    `reconcileNativeSuggestions: done in ${Date.now() - startTime}ms, ` +
      `matched=${result.matchedSuggestionIds.length}, skipReview=${result.skipReview}, reason=${result.reason}`,
  );

  return result;
}
