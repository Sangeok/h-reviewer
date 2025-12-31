"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";

export async function getReviews() {
  const session = await requireAuthSession();

  const reviews = await prisma.review.findMany({
    where: {
      repository: {
        userId: session.user.id,
      },
    },
    include: {
      repository: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  return reviews;
}
