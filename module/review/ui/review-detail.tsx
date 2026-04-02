"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SuggestionList } from "@/module/suggestion";
import { ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReviewDetailData } from "../types";

interface Props {
  review: ReviewDetailData;
}

export default function ReviewDetail({ review }: Props) {
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
            <h1 className="text-2xl font-medium text-foreground">{review.prTitle}</h1>
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
        <CardContent className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {review.review}
          </ReactMarkdown>
        </CardContent>
      </Card>

      {/* Suggestions */}
      {review.suggestions.length > 0 && (
        <SuggestionList reviewId={review.id} initialData={review.suggestions} />
      )}
    </div>
  );
}
