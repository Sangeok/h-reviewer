import type { UserProfileProps } from "../../types";
import { UserAvatar } from "./user-avatar";

export function UserProfile({ user, isCollapsed }: UserProfileProps) {
  if (isCollapsed) {
    return (
      <div className="group relative flex justify-center">
        <UserAvatar
          user={user}
          className="cursor-pointer hover:border-[#4a6a4a]/50 hover:ring-[#2d3e2d]/20 transition-all duration-300"
        />

        {/* Tooltip */}
        <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none z-50">
          <div className="relative">
            {/* Arrow */}
            <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-[#1a1a1a]" />

            {/* Tooltip Content */}
            <div className="rounded-lg border border-[#1a1a1a] bg-gradient-to-b from-[#0a0a0a] to-black backdrop-blur-xl p-3 shadow-2xl shadow-[#2d3e2d]/5 min-w-[200px]">
              <p className="text-sm font-medium text-[#e0e0e0] truncate">
                {user.name || "User"}
              </p>
              <p className="text-xs text-[#606060] truncate mt-1 font-light">
                {user.email || ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#1a1a1a] bg-gradient-to-b from-[#0a0a0a]/50 to-black/50 p-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <UserAvatar user={user} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#e0e0e0] truncate">
            {user.name || "User"}
          </p>
          <p className="text-xs text-[#606060] truncate font-light">{user.email || ""}</p>
        </div>
      </div>
    </div>
  );
}
