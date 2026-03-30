import { getReviewById } from "@/module/review/actions";
import { ReviewDetail } from "@/module/review/ui/review-detail";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const review = await getReviewById(id);

  if (!review) notFound();

  return <ReviewDetail review={review} />;
}
