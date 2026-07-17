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
  let session = null;
  try {
    session = await requireAuthSession();
  } catch {
    return null;
  }
  if (session) redirect("/dashboard");
}
