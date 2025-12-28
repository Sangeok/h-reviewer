import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LogoProps } from "../../types";

export function Logo({ isCollapsed, onToggleCollapse }: LogoProps) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2 group">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 blur-lg opacity-50 group-hover:opacity-70 transition-opacity" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/25">
            <svg
              className="h-6 w-6 text-[#0a0a0f]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
        </div>
        {!isCollapsed && (
          <span className="font-mono text-xl font-black tracking-tighter text-white">
            HReviewer
          </span>
        )}
      </Link>

      <button
        onClick={onToggleCollapse}
        className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-cyan-400 transition-all duration-200"
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
