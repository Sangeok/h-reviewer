import prisma from "@/lib/db";
import { getCompareFiles } from "@/lib/github/github";
import { extractPatchOldSideTouchedLines } from "@/lib/github/diff-parser";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

type ReconcileIssueParams = {
  token: string;
  headOwner: string;
  headRepoName: string;
  baseRepositoryId: string;
  prNumber: number;
  beforeSha: string;
  afterSha: string;
};

export type ReconcileIssueResult =
  | { strong: number; weak: number }
  | { skipped: true; reason: "no_matching_review" | "no_pending_inline_issues" | "compare_api_failed" };

const judgeSchema = z.object({
  verdicts: z.array(
    z.object({
      issueIndex: z.number(),
      addressed: z.boolean(),
    }),
  ),
});

/**
 * synchronize 시 push된 커밋이 리뷰 이슈가 가리킨 라인을 수정했는지 검사하고,
 * 시맨틱 판정으로 "지적을 실제로 해결했는가"를 구분해 라벨을 붙인다.
 * 앵커는 reconcileNativeSuggestions와 동일: headSha === beforeSha 인 리뷰.
 */
export async function reconcileIssueResolutions(
  params: ReconcileIssueParams,
): Promise<ReconcileIssueResult> {
  const { token, headOwner, headRepoName, baseRepositoryId, prNumber, beforeSha, afterSha } = params;

  const review = await prisma.review.findFirst({
    where: { repositoryId: baseRepositoryId, prNumber, headSha: beforeSha },
    orderBy: { createdAt: "desc" },
  });
  if (!review) return { skipped: true, reason: "no_matching_review" };

  const pendingIssues = await prisma.reviewIssue.findMany({
    where: {
      reviewId: review.id,
      resolutionStatus: "PENDING",
      filePath: { not: null },
      lineNumber: { not: null },
    },
    select: { id: true, filePath: true, lineNumber: true, title: true, body: true },
  });
  if (pendingIssues.length === 0) return { skipped: true, reason: "no_pending_inline_issues" };

  let compareFiles: Awaited<ReturnType<typeof getCompareFiles>>;
  try {
    compareFiles = await getCompareFiles({
      token, owner: headOwner, repo: headRepoName, base: beforeSha, head: afterSha,
    });
  } catch (error) {
    console.error(
      `reconcileIssueResolutions: compare_api_failed ${headOwner}/${headRepoName} ${beforeSha}..${afterSha}`,
      error,
    );
    return { skipped: true, reason: "compare_api_failed" };
  }

  const touchedByFile = new Map<string, Set<number>>();
  for (const file of compareFiles) {
    if (!file.patch) continue; // 대용량 파일 등 patch 미제공 → 판정 불가, PENDING 유지
    touchedByFile.set(file.path, extractPatchOldSideTouchedLines(file.patch));
  }

  const candidates = pendingIssues.filter((issue) => {
    const touched = touchedByFile.get(issue.filePath as string);
    return touched?.has(issue.lineNumber as number) ?? false;
  });
  if (candidates.length === 0) return { strong: 0, weak: 0 };

  // 시맨틱 판정 — "라인이 바뀜"과 "지적이 해결됨"을 구분 (리팩토링 휩쓸림 → WEAK)
  let strongIds: string[] = [];
  let weakIds: string[] = [];
  try {
    const candidateBlocks = candidates
      .map((issue, index) => {
        const patch = compareFiles.find((f) => f.path === issue.filePath)?.patch ?? "";
        return `[${index}] ${issue.filePath}:${issue.lineNumber}\nIssue: ${issue.title}\n${issue.body}\nPatch:\n${patch}`;
      })
      .join("\n\n---\n\n");

    const { experimental_output } = await generateText({
      model: google("gemini-2.5-flash"),
      experimental_output: Output.object({ schema: judgeSchema }),
      prompt:
        "For each review issue below, decide whether the code change in the patch actually resolves that issue " +
        "(not merely touches the same lines). Return a verdict for every index.\n\n" +
        candidateBlocks,
    });

    const verdictMap = new Map(
      (experimental_output?.verdicts ?? []).map((v) => [v.issueIndex, v.addressed]),
    );
    candidates.forEach((issue, index) => {
      if (verdictMap.get(index) === true) strongIds.push(issue.id);
      else weakIds.push(issue.id);
    });
  } catch (error) {
    console.warn("reconcileIssueResolutions: judge failed, downgrading all to WEAK", error);
    strongIds = [];
    weakIds = candidates.map((c) => c.id);
  }

  const resolvedAt = new Date();
  if (strongIds.length > 0) {
    await prisma.reviewIssue.updateMany({
      where: { id: { in: strongIds } },
      data: { resolutionStatus: "ADDRESSED_STRONG", resolvedAt, resolvedBySha: afterSha },
    });
  }
  if (weakIds.length > 0) {
    await prisma.reviewIssue.updateMany({
      where: { id: { in: weakIds } },
      data: { resolutionStatus: "ADDRESSED_WEAK", resolvedAt, resolvedBySha: afterSha },
    });
  }

  return { strong: strongIds.length, weak: weakIds.length };
}
