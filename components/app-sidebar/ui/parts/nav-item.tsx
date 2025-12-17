import Link from "next/link";
import type { NavItemProps } from "../../types";

export function NavItem({ item, isActive, isCollapsed }: NavItemProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.url}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-200 ${
        isActive
          ? "bg-gradient-to-r from-cyan-500/10 to-blue-600/10 text-cyan-400 shadow-lg shadow-cyan-500/5"
          : "text-gray-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {/* Active Indicator Glow */}
      {isActive && (
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-600/20 blur-md -z-10" />
      )}

      {/* Left Border Indicator */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 to-blue-600" />
      )}

      <Icon
        className={`h-5 w-5 flex-shrink-0 transition-transform duration-200 ${
          isActive ? "scale-110" : "group-hover:scale-110"
        }`}
      />

      {!isCollapsed && (
        <span className="text-sm font-medium truncate">{item.title}</span>
      )}

      {/* Hover Shimmer Effect */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
    </Link>
  );
}
