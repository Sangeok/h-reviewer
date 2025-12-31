"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * Get authenticated session with validation.
 * Throws error if user is not authenticated.
 */
export async function requireAuthSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session;
}

/**
 * Get authenticated user.
 * Throws error if user is not authenticated.
 */
export async function getAuthUser() {
  const session = await requireAuthSession();
  return session.user;
}
