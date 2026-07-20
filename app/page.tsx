import { requireAuth } from "@/features/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  await requireAuth();
  return redirect("/dashboard");
}
