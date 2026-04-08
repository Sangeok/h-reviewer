import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Lightbulb } from "lucide-react";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import Link from "next/link";
import type { ReviewListItem } from "../../types";
import { REVIEW_PREVIEW_MAX_CHARS } from "../../constants";
import { ReviewStatusBadge } from "./review-status-badge";

interface ReviewCardProps {
  review: ReviewListItem;
}

export function ReviewCard({ review }: ReviewCardProps) {
  return (
    <Card className="group relative overflow-hidden bg-gradient-to-b from-card to-background border-border hover:border-ring/50 transition-all duration-300">
      {/* Subtle hover glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-ring/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <CardHeader className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-lg font-medium text-foreground">
                {review.prTitle}
              </CardTitle>

              <ReviewStatusBadge status={review.status} />

              {review._count.suggestions > 0 && (
                <Badge className="bg-blue-950/30 text-blue-400 border border-blue-800/30 hover:bg-blue-950/40">
                  <Lightbulb className="w-3 h-3 mr-1" />
                  {review._count.suggestions} suggestion{review._count.suggestions !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            <CardDescription className="text-muted-foreground font-light">
              {review.repository.fullName} • PR #{review.prNumber}
            </CardDescription>
          </div>

          <Button
            variant="ghost"
            size="icon"
            asChild
            className="hover:bg-secondary hover:text-primary transition-all duration-300"
          >
            <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="relative z-10">
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground-alt font-light">
            {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
          </div>

          {/* Review Preview - Terminal Style */}
          <div className="relative rounded-lg border border-border bg-card p-4 overflow-hidden">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-destructive-bg" />
                <div className="w-2.5 h-2.5 rounded-full bg-warning" />
                <div className="w-2.5 h-2.5 rounded-full bg-ring" />
              </div>
              <span className="text-xs text-muted-foreground-alt font-mono">AI Review</span>
            </div>

            <pre className="text-xs text-secondary-foreground font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {(review.review ?? "").substring(0, REVIEW_PREVIEW_MAX_CHARS)}...
            </pre>

            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              asChild
              className="border-ring/30 text-secondary-foreground hover:border-ring/50 hover:bg-secondary hover:text-primary transition-all duration-300"
            >
              <Link href={`/dashboard/reviews/${review.id}`}>
                View Details
              </Link>
            </Button>
            <Button
              variant="ghost"
              asChild
              className="text-muted-foreground hover:text-primary transition-all duration-300"
            >
              <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                GitHub
              </a>
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Bottom shimmer effect on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-ring/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </Card>
  );
}
