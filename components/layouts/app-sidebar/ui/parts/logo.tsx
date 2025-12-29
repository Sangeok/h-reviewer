import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LogoProps } from "../../types";

export function Logo({ isCollapsed, onToggleCollapse }: LogoProps) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2 group">
        <div className="relative">
          {/* Subtle glow */}
          <div className="absolute inset-0 bg-[#2d3e2d] blur-xl opacity-15 group-hover:opacity-25 transition-opacity duration-300" />

          {/* Icon container */}
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-[#2d3e2d]/30 shadow-lg">
            <svg
              className="h-6 w-6 text-[#4a6a4a]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
        </div>
        {!isCollapsed && (
          <span className="font-mono text-xl font-medium tracking-tight text-[#d0d0d0]">
            HReviewer
          </span>
        )}
      </Link>

      <button
        onClick={onToggleCollapse}
        className="rounded-lg p-2 text-[#606060] hover:bg-[#1a1a1a] hover:text-[#4a6a4a] transition-all duration-300"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
