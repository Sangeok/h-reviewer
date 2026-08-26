"use client";

import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SuggestionList, SuggestionListSkeleton } from "@/features/suggestion";
import { ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReviewDetailData } from "../types";
import type { StoredReviewData } from "@/features/ai";
import type { LanguageCode } from "@/shared/types/language";
import { StructuredReviewBody } from "./parts/structured-review-body";
import { VerificationPanel } from "./parts/verification-panel";
import { ReviewRetryButton } from "./parts/review-retry-button";
import {
  getReviewStatusPresentation,
  ReviewStatusBadge,
} from "./parts/review-status-badge";

interface ReviewDetailProps {
  review: ReviewDetailData;
  structuredData: StoredReviewData | null;
  langCode: LanguageCode;
}

export default function ReviewDetail({
  review,
  structuredData,
  langCode,
}: ReviewDetailProps) {
  const isCompleted = review.status === "COMPLETED";
  const statusPresentation = getReviewStatusPresentation(review.status);
  const isRetryableFailure =
    review.status === "FAILED" &&
    review.failureStage !== null &&
    review.failureStage !== "LEGACY";
  const structuredSuggestionCount = structuredData?.suggestions.length ?? 0;
  const persistedSuggestionCount = review.suggestions.length;
  const shouldRenderSuggestionSummary =
    persistedSuggestionCount < structuredSuggestionCount;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="space-y-3">
        <Link
          href="/dashboard/reviews"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reviews
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-medium text-foreground">{review.prTitle}</h1>
              <ReviewStatusBadge status={review.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {review.repository.fullName} • PR #{review.prNumber}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-1" />
              GitHub
            </a>
          </Button>
        </div>
      </div>

      {/* Review Body */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-foreground">Review</CardTitle>
        </CardHeader>
        <CardContent>
          {!isCompleted ? (
            <div className="space-y-2 text-sm text-secondary-foreground">
              <p>{review.failureMessage ?? statusPresentation.description}</p>
              {review.status === "FAILED" && (
                <p className="text-muted-foreground">
                  {isRetryableFailure
                    ? "This review can be retried."
                    : "Retry is unavailable for this legacy failure."}
                </p>
              )}
              {isRetryableFailure && <ReviewRetryButton reviewId={review.id} />}
            </div>
          ) : structuredData ? (
            <StructuredReviewBody
              data={structuredData}
              langCode={langCode}
              shouldRenderSuggestionSummary={shouldRenderSuggestionSummary}
            />
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {review.review}
              </ReactMarkdown>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Verification (검수자) */}
      {isCompleted && structuredData?.verification && (
        <VerificationPanel
          issues={structuredData.issues}
          verification={structuredData.verification}
          langCode={langCode}
        />
      )}

      {/* Suggestions */}
      {isCompleted && review.suggestions.length > 0 && (
        <QueryBoundary
          fallback={<SuggestionListSkeleton />}
          title="Suggestions"
          description="Failed to load suggestions"
        >
          <SuggestionList reviewId={review.id} initialData={review.suggestions} />
        </QueryBoundary>
      )}
    </div>
  );
}
