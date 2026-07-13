import prisma from "@/lib/db";
import { generateEmbedding } from "./generate-embedding";
import {
  REPEAT_MIN_TEXT_LENGTH,
  REPEAT_SIMILARITY_THRESHOLD,
  REPEAT_WINDOW_DAYS,
} from "../constants";
import type { StructuredIssue } from "../types";

export interface RepeatBadgeInfo {
  prUrl: string;
  date: string; // YYYY-MM-DD
}

export interface RepeatAnnotation {
  embedding: number[] | null;
  isRepeat: boolean;
  repeatOfIssueId: string | null;
  repeatSimilarity: number | null;
  repeat: RepeatBadgeInfo | null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildIssueEmbeddingText(issue: StructuredIssue): string {
  return [issue.title, issue.body].filter(Boolean).join("\n").trim();
}

/**
 * 새 이슈들을 같은 사용자의 90일 이내 과거 이슈와 비교해 반복 여부를 판정한다.
 * 캘리브레이션 제약: category-primary 필터(같은 카테고리만 비교) + 짧은 텍스트 제외.
 * 후보에서 IGNORED(사용자가 무시한 지적)와 같은 PR의 이슈는 제외한다.
 */
export async function detectRepeatIssues(params: {
  issues: StructuredIssue[];
  userId: string;
  repositoryId: string;
  prNumber: number;
}): Promise<RepeatAnnotation[]> {
  const { issues, userId, repositoryId, prNumber } = params;

  if (issues.length === 0) return [];

  const windowStart = new Date(Date.now() - REPEAT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.reviewIssue.findMany({
    where: {
      userId,
      createdAt: { gte: windowStart },
      resolutionStatus: { not: "IGNORED" },
      NOT: { review: { repositoryId, prNumber } }, // 같은 PR 재리뷰 이슈로 자기 자신에 배지 방지
    },
    select: {
      id: true,
      category: true,
      embedding: true,
      createdAt: true,
      review: { select: { prUrl: true } },
    },
  });

  const annotations: RepeatAnnotation[] = [];

  for (const issue of issues) {
    const text = buildIssueEmbeddingText(issue);

    if (text.length < REPEAT_MIN_TEXT_LENGTH) {
      annotations.push({
        embedding: null, isRepeat: false, repeatOfIssueId: null,
        repeatSimilarity: null, repeat: null,
      });
      continue;
    }

    const embedding = await generateEmbedding(text, "SEMANTIC_SIMILARITY");

    let best: { id: string; similarity: number; prUrl: string; createdAt: Date } | null = null;
    for (const candidate of candidates) {
      if (candidate.category !== issue.category) continue; // category-primary
      if (!Array.isArray(candidate.embedding)) continue;

      const similarity = cosineSimilarity(embedding, candidate.embedding as number[]);
      if (similarity >= REPEAT_SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
        best = {
          id: candidate.id,
          similarity,
          prUrl: candidate.review.prUrl,
          createdAt: candidate.createdAt,
        };
      }
    }

    annotations.push({
      embedding,
      isRepeat: best !== null,
      repeatOfIssueId: best?.id ?? null,
      repeatSimilarity: best?.similarity ?? null,
      repeat: best
        ? { prUrl: best.prUrl, date: new Date(best.createdAt).toISOString().slice(0, 10) }
        : null,
    });
  }

  return annotations;
}
