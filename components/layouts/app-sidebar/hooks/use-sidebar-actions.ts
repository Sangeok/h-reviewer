"use client";

import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export function useSidebarActions() {
  const router = useRouter();

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [router]);

  return { handleLogout };
}
