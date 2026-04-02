import { getUserReviewById, ReviewDetail } from "@/module/review";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const review = await getUserReviewById(id);

  if (!review) notFound();

  return <ReviewDetail review={review} />;
}
