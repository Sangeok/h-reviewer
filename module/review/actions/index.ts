"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";

export async function getReviews() {
  const session = await requireAuthSession();

  return prisma.review.findMany({
    where: {
      repository: {
        userId: session.user.id,
      },
    },
    include: {
      repository: true,
      _count: { select: { suggestions: true } },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });
}

export async function getReviewById(reviewId: string) {
  const session = await requireAuthSession();

  return prisma.review.findFirst({
    where: {
      id: reviewId,
      repository: { userId: session.user.id },
    },
    include: {
      repository: true,
      suggestions: {
        orderBy: [
          { severity: "asc" },
          { lineNumber: "asc" },
        ],
      },
    },
  });
}
