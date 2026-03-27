"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SuggestionList } from "@/module/suggestion/components/suggestion-list";
import { ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReviewWithSuggestions {
  id: string;
  prTitle: string;
  prNumber: number;
  prUrl: string;
  review: string;
  status: string;
  headSha: string | null;
  createdAt: Date;
  repository: {
    fullName: string;
    owner: string;
    name: string;
  };
  suggestions: Array<{
    id: string;
    reviewId: string;
    filePath: string;
    lineNumber: number;
    beforeCode: string;
    afterCode: string;
    explanation: string;
    severity: "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";
    status: "PENDING" | "APPLIED" | "DISMISSED" | "CONFLICTED";
    appliedAt: Date | null;
    appliedCommitSha: string | null;
    dismissedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

interface Props {
  review: ReviewWithSuggestions;
}

export function ReviewDetail({ review }: Props) {
  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="space-y-3">
        <Link
          href="/dashboard/reviews"
          className="inline-flex items-center gap-1 text-sm text-[#707070] hover:text-[#e0e0e0] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reviews
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-medium text-[#e0e0e0]">{review.prTitle}</h1>
            <p className="text-sm text-[#707070] mt-1">
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
      <Card className="border-[#1a1a1a] bg-[#0a0a0a]">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-[#e0e0e0]">Review</CardTitle>
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
