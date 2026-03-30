"use client";

import { useCallback, useState } from "react";
import { THEME_CONFIG } from "../constants/config";

function getInitialCollapsed(defaultCollapsed: boolean): boolean {
  if (typeof window === "undefined") return defaultCollapsed;
  const saved = localStorage.getItem(THEME_CONFIG.storageKey);
  if (saved !== null) {
    return JSON.parse(saved);
  }
  return defaultCollapsed;
}

export function useSidebarState(defaultCollapsed = false) {
  const [isCollapsed, setIsCollapsed] = useState(() => getInitialCollapsed(defaultCollapsed));

  // 상태 변경 시 localStorage에 저장
  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(THEME_CONFIG.storageKey, JSON.stringify(next));
      return next;
    });
  }, []);

  return { isCollapsed, toggleCollapse };
}
