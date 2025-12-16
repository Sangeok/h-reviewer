"use client";

import { signOut, useSession } from "@/lib/auth-client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { NAV_ITEMS } from "@/components/app-sidebar/constants";
import Link from "next/link";
import { LogOut, ChevronLeft, ChevronRight, Sun, Moon } from "lucide-react";

export default function AppSidebar() {
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <aside
      className={`relative h-screen border-r border-gray-800 bg-[#12121a]/90 backdrop-blur-xl transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 opacity-30 overflow-hidden pointer-events-none">
        <div className="absolute top-[-50%] right-[-50%] w-[300px] h-[300px] rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 blur-[80px] animate-float" />
        <div className="absolute bottom-[-30%] left-[-30%] w-[250px] h-[250px] rounded-full bg-gradient-to-tr from-purple-500/10 to-pink-500/10 blur-[60px] animate-float-delayed" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-4">
        {/* Logo Section */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 blur-lg opacity-50 group-hover:opacity-70 transition-opacity" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/25">
                <svg className="h-6 w-6 text-[#0a0a0f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <span className="font-mono text-xl font-black tracking-tighter text-white">HReviewer</span>
            )}
          </Link>

          {/* Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-cyan-400 transition-all duration-200"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* User Profile Section */}
        {session?.user && (
          <div className="mb-6">
            {isCollapsed ? (
              // Collapsed: Show only avatar with tooltip
              <div className="group relative flex justify-center">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="h-10 w-10 rounded-full border-2 border-cyan-500/30 ring-2 ring-cyan-500/10 cursor-pointer hover:border-cyan-400/50 hover:ring-cyan-400/20 transition-all duration-200"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform duration-200">
                    <span className="text-[#0a0a0f] font-bold text-sm">{session.user.name?.charAt(0) || "U"}</span>
                  </div>
                )}

                {/* Tooltip */}
                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50">
                  <div className="relative">
                    {/* Arrow */}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-gray-800" />

                    {/* Tooltip Content */}
                    <div className="rounded-xl border border-gray-800 bg-[#0a0a0f]/95 backdrop-blur-xl p-3 shadow-2xl shadow-cyan-500/10 min-w-[200px]">
                      <p className="text-sm font-semibold text-white truncate">{session.user.name || "User"}</p>
                      <p className="text-xs text-gray-400 truncate mt-1">{session.user.email || ""}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Expanded: Show full profile card
              <div className="rounded-xl border border-gray-800 bg-[#0a0a0f]/50 p-3 backdrop-blur">
                <div className="flex items-center gap-3">
                  {session.user.image ? (
                    <img
                      src={session.user.image}
                      alt={session.user.name || "User"}
                      className="h-10 w-10 rounded-full border-2 border-cyan-500/30 ring-2 ring-cyan-500/10"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                      <span className="text-[#0a0a0f] font-bold">{session.user.name?.charAt(0) || "U"}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{session.user.name || "User"}</p>
                    <p className="text-xs text-gray-400 truncate">{session.user.email || ""}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.url;
            const Icon = item.icon;

            return (
              <Link
                key={item.url}
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

                {!isCollapsed && <span className="text-sm font-medium truncate">{item.title}</span>}

                {/* Hover Shimmer Effect */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle & Logout */}
        <div className="pt-4 border-t border-gray-800 space-y-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="group w-full flex items-center gap-3 rounded-xl px-3 py-3 text-gray-400 hover:bg-white/5 hover:text-cyan-400 transition-all duration-200 relative overflow-hidden"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />

            {/* Icon with Rotation Animation */}
            <div className="relative h-5 w-5 flex-shrink-0">
              <Sun
                className={`absolute inset-0 transition-all duration-300 ${
                  theme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
                }`}
              />
              <Moon
                className={`absolute inset-0 transition-all duration-300 ${
                  theme === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
                }`}
              />
            </div>

            {!isCollapsed && (
              <div className="relative flex items-center justify-between flex-1">
                <span className="text-sm font-medium">{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
                {/* Toggle Indicator */}
                <div className="flex items-center gap-2">
                  <div className="relative w-10 h-5 rounded-full bg-gray-700 transition-colors duration-200">
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/25 transition-transform duration-200 ${
                        theme === "dark" ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </div>
                </div>
              </div>
            )}
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="group w-full flex items-center gap-3 rounded-xl px-3 py-3 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
          >
            <LogOut className="h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
            {!isCollapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>

        {/* Bottom Decoration */}
        {!isCollapsed && (
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-600 font-mono">v1.0.0 • 2025</p>
          </div>
        )}
      </div>

      {/* Right Edge Glow */}
      <div className="absolute top-0 right-0 h-full w-px bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent" />
    </aside>
  );
}
