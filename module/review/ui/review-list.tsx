"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getReviews } from "@/module/review";
import { useQuery } from "@tanstack/react-query";
import { Badge, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";

export default function ReviewList() {
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["reviews"],
    queryFn: async () => await getReviews(),
  });

  if (isLoading) {
    return (
      <div>
        <h1>Loading reviews...</h1>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Review History</h1>
        <p className="text-muted-foreground">View your reviews</p>
      </div>

      {reviews?.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No reviews found</p>
            </div>
          </CardContent>
        </Card>
      )}

      {reviews && reviews.length > 0 && (
        <div className="grid gap-4">
          {reviews.map((review) => (
            <Card key={review.id} className="hover:shadow-md transition-shadow duration-300">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{review.prTitle}</CardTitle>
                      {review.status === "completed" && <Badge className="bg-green-500 text-white">Completed</Badge>}
                      {review.status === "failed" && <Badge className="bg-red-500 text-white">Failed</Badge>}
                      {review.status === "pending" && <Badge className="bg-yellow-500 text-white">Pending</Badge>}
                    </div>
                    <CardDescription>
                      {review.repository.fullName} PR #{review.prNumber}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" asChild>
                    <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="whitespace-pre-wrap text-xs">{review.review.substring(0, 300)}...</pre>
                    </div>
                  </div>
                  <div>
                    <Button variant="outline" asChild>
                      <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
                        View Pull Review on Github
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
