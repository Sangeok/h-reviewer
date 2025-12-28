"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_CONFIG } from "../constants/config";

export function useSidebarState(defaultCollapsed = false) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // localStorage에서 초기값 복원
  useEffect(() => {
    const saved = localStorage.getItem(THEME_CONFIG.storageKey);
    if (saved !== null) {
      setIsCollapsed(JSON.parse(saved));
    }
  }, []);

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
