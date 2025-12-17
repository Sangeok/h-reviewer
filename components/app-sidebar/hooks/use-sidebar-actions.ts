"use client";

import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback } from "react";

export function useSidebarActions() {
  const router = useRouter();
  const { setTheme, theme } = useTheme();

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [router]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { handleLogout, toggleTheme, theme };
}
