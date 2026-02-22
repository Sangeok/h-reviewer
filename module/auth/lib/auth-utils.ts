"use server";

import { requireAuthSession } from "@/lib/server-utils";
import { redirect } from "next/navigation";

export async function requireAuth() {
  try {
    return await requireAuthSession();
  } catch {
    redirect("/login");
  }
}

export async function requireUnAuth() {
  try {
    await requireAuthSession();
    redirect("/dashboard");
  } catch {
    return null;
  }
}
