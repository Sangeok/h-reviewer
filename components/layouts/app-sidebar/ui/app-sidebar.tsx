"use client";

import { useSession } from "@/lib/auth-client";
import { useHydration } from "../hooks/use-hydration";
import { useSidebarState } from "../hooks/use-sidebar-state";
import { useSidebarActions } from "../hooks/use-sidebar-actions";
import { SIDEBAR_STYLES } from "../constants/styles";
import type { SidebarProps } from "../types";
import { Logo } from "./parts/logo";
import { UserProfile } from "./parts/user-profile";
import { Navigation } from "./parts/navigation";
import { ThemeToggle } from "./parts/theme-toggle";
import { LogoutButton } from "./parts/logout-button";
import { Footer } from "./parts/footer";

export default function AppSidebar({
  defaultCollapsed = false,
  className = "",
}: SidebarProps) {
  const mounted = useHydration();
  const { isCollapsed, toggleCollapse } = useSidebarState(defaultCollapsed);
  const { handleLogout, toggleTheme } = useSidebarActions();
  const { data: session } = useSession();

  if (!mounted) {
    return null;
  }

  return (
    <aside
      className={`${SIDEBAR_STYLES.container.base} ${
        isCollapsed
          ? SIDEBAR_STYLES.container.collapsed
          : SIDEBAR_STYLES.container.expanded
      } ${className}`}
    >
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 opacity-30 overflow-hidden pointer-events-none">
        <div className="absolute top-[-50%] right-[-50%] w-[300px] h-[300px] rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 blur-[80px] animate-float" />
        <div className="absolute bottom-[-30%] left-[-30%] w-[250px] h-[250px] rounded-full bg-gradient-to-tr from-purple-500/10 to-pink-500/10 blur-[60px] animate-float-delayed" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-4">
        <Logo isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} />

        {session?.user && (
          <div className="mb-6">
            <UserProfile user={session.user} isCollapsed={isCollapsed} />
          </div>
        )}

        <Navigation isCollapsed={isCollapsed} />

        <div className="pt-4 border-t border-gray-800 space-y-2">
          <ThemeToggle isCollapsed={isCollapsed} onToggle={toggleTheme} />
          <LogoutButton isCollapsed={isCollapsed} onLogout={handleLogout} />
        </div>

        <Footer isCollapsed={isCollapsed} />
      </div>

      {/* Right Edge Glow */}
      <div className="absolute top-0 right-0 h-full w-px bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent" />
    </aside>
  );
}
