"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "../../constants";
import type { NavigationProps } from "../../types";
import { NavItem } from "./nav-item";

export function Navigation({ isCollapsed }: NavigationProps) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-2">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.url;

        return (
          <NavItem
            key={item.url}
            item={item}
            isActive={isActive}
            isCollapsed={isCollapsed}
          />
        );
      })}
    </nav>
  );
}
