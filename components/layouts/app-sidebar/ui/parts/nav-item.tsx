import Link from "next/link";
import type { NavItemProps } from "../../types";

export function NavItem({ item, isActive, isCollapsed }: NavItemProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.url}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-3 transition-all duration-300 ${
        isActive
          ? "bg-gradient-to-r from-[#2d3e2d]/20 to-[#3d523d]/10 text-[#4a6a4a] border border-[#2d3e2d]/30"
          : "text-[#707070] hover:bg-[#1a1a1a] hover:text-[#d0d0d0]"
      }`}
    >
      {/* Active Indicator - Extremely Subtle Glow */}
      {isActive && (
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#2d3e2d]/10 to-transparent blur-md -z-10 opacity-50" />
      )}

      {/* Left Border Indicator */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[2px] rounded-r-full bg-gradient-to-b from-[#4a6a4a] to-[#3d523d]" />
      )}

      <Icon
        className={`h-5 w-5 flex-shrink-0 transition-transform duration-300 ${
          isActive ? "scale-105" : "group-hover:scale-105"
        }`}
      />

      {!isCollapsed && (
        <span className="text-sm font-medium truncate">{item.title}</span>
      )}

      {/* Subtle Hover Shimmer Effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-[#2d3e2d]/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
    </Link>
  );
}
