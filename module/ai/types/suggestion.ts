import { z } from "zod";
import { issueCategorySchema } from "@/module/ai/lib/review-schema";

export type SuggestionSeverity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";

export interface CodeSuggestion {
  file: string;
  line: number;
  before: string;
  after: string;
  explanation: string;
  severity: SuggestionSeverity;
}

// IssueCategory는 review-schema.ts의 Zod enum에서 derive — 이중 정의 방지
export type IssueCategory = z.infer<typeof issueCategorySchema>;

export interface StructuredIssue {
  file: string | null;
  line: number | null;
  description: string;
  severity: SuggestionSeverity;
  category: IssueCategory;
}

// StructuredReview 삭제 — 사용처 없음 (StructuredReviewOutput이 실제 타입)
