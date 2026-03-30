"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, ExternalLink, FileCode, Lightbulb } from "lucide-react";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import Link from "next/link";
import { useReviews } from "../hooks/use-reviews";
import type { getReviews } from "../actions";

type ReviewsData = Awaited<ReturnType<typeof getReviews>>;

interface ReviewListProps {
  initialData?: ReviewsData;
}

export default function ReviewList({ initialData }: ReviewListProps) {
  const { reviews } = useReviews(initialData);

  return (
    <>
      {/* Empty State */}
      {reviews?.length === 0 && (
        <Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
          <CardContent className="pt-6">
            <div className="text-center py-16">
              <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-lg bg-[#1a1a1a] border border-[#2d3e2d]/30">
                <FileCode className="h-8 w-8 text-[#4a6a4a]" />
              </div>
              <p className="text-sm text-[#707070] font-light">No reviews found</p>
              <p className="text-xs text-[#606060] font-light mt-2">
                Connect a repository and create a pull request to get started
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Cards */}
      {reviews && reviews.length > 0 && (
        <div className="grid gap-4">
          {reviews.map((review) => (
            <Card
              key={review.id}
              className="group relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a] hover:border-[#2d3e2d]/50 transition-all duration-300"
            >
              {/* Subtle hover glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#2d3e2d]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <CardHeader className="relative z-10">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-lg font-medium text-[#e0e0e0]">
                        {review.prTitle}
                      </CardTitle>

                      {/* Status Badges */}
                      {review.status === "completed" && (
                        <Badge className="bg-gradient-to-r from-[#2d3e2d]/30 to-[#3d523d]/20 text-[#4a6a4a] border border-[#2d3e2d]/30 hover:bg-gradient-to-r hover:from-[#2d3e2d]/40 hover:to-[#3d523d]/30">
                          Completed
                        </Badge>
                      )}
                      {review.status === "failed" && (
                        <Badge className="bg-[#3a1a1a]/30 text-[#ff6b6b] border border-[#3a1a1a]/50 hover:bg-[#3a1a1a]/40">
                          Failed
                        </Badge>
                      )}
                      {review.status === "pending" && (
                        <Badge className="bg-[#3a3020]/30 text-[#d4a574] border border-[#3a3020]/50 hover:bg-[#3a3020]/40">
                          Pending
                        </Badge>
                      )}

                      {/* Suggestion Count Badge */}
                      {review._count.suggestions > 0 && (
                        <Badge className="bg-blue-950/30 text-blue-400 border border-blue-800/30 hover:bg-blue-950/40">
                          <Lightbulb className="w-3 h-3 mr-1" />
                          {review._count.suggestions} suggestion{review._count.suggestions !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>

                    <CardDescription className="text-[#707070] font-light">
                      {review.repository.fullName} • PR #{review.prNumber}
                    </CardDescription>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="hover:bg-[#1a1a1a] hover:text-[#4a6a4a] transition-all duration-300"
                  >
                    <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="relative z-10">
                <div className="space-y-4">
                  {/* Timestamp */}
                  <div className="text-xs text-[#606060] font-light">
                    {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                  </div>

                  {/* Review Preview - Terminal Style */}
                  <div className="relative rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-4 overflow-hidden">
                    {/* Terminal header */}
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1a1a1a]">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#3a1a1a]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#3a3020]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2d3e2d]" />
                      </div>
                      <span className="text-xs text-[#606060] font-mono">AI Review</span>
                    </div>

                    {/* Code preview */}
                    <pre className="text-xs text-[#d0d0d0] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                      {review.review.substring(0, 300)}...
                    </pre>

                    {/* Subtle gradient overlay at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      asChild
                      className="border-[#2d3e2d]/30 text-[#d0d0d0] hover:border-[#2d3e2d]/50 hover:bg-[#1a1a1a] hover:text-[#4a6a4a] transition-all duration-300"
                    >
                      <Link href={`/dashboard/reviews/${review.id}`}>
                        View Details
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      asChild
                      className="text-[#707070] hover:text-[#4a6a4a] transition-all duration-300"
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
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#2d3e2d]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
