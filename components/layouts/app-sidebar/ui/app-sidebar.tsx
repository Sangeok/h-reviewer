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
      {/* Extremely Subtle Background Gradient Orbs */}
      <div className="absolute inset-0 opacity-[0.06] overflow-hidden pointer-events-none">
        <div
          className="absolute top-[10%] right-[-20%] w-[250px] h-[250px] rounded-full blur-[100px] animate-pulse-slow"
          style={{
            background: "radial-gradient(circle, rgba(45, 62, 45, 0.4) 0%, transparent 70%)",
            animationDuration: "8s",
          }}
        />
        <div
          className="absolute bottom-[20%] left-[-20%] w-[200px] h-[200px] rounded-full blur-[90px] animate-pulse-slow"
          style={{
            background: "radial-gradient(circle, rgba(30, 30, 40, 0.3) 0%, transparent 70%)",
            animationDuration: "10s",
            animationDelay: "2s",
          }}
        />
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

        <div className="pt-4 border-t border-[#1a1a1a] space-y-2">
          <ThemeToggle isCollapsed={isCollapsed} onToggle={toggleTheme} />
          <LogoutButton isCollapsed={isCollapsed} onLogout={handleLogout} />
        </div>

        <Footer isCollapsed={isCollapsed} />
      </div>

      {/* Right Edge Subtle Glow */}
      <div className="absolute top-0 right-0 h-full w-[1px] bg-gradient-to-b from-transparent via-[#2d3e2d]/10 to-transparent" />

      <style jsx>{`
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.06;
          }
          50% {
            opacity: 0.10;
          }
        }

        .animate-pulse-slow {
          animation: pulse-slow ease-in-out infinite;
        }
      `}</style>
    </aside>
  );
}
