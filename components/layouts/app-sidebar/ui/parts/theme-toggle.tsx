import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ThemeToggleProps } from "../../types";

export function ThemeToggle({ isCollapsed, onToggle }: ThemeToggleProps) {
  const { theme } = useTheme();

  return (
    <button
      onClick={onToggle}
      className="group w-full flex items-center gap-3 rounded-lg px-3 py-3 text-[#707070] hover:bg-[#1a1a1a] hover:text-[#4a6a4a] transition-all duration-300 relative overflow-hidden"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {/* Subtle Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#2d3e2d]/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

      {/* Icon with Rotation Animation */}
      <div className="relative h-5 w-5 flex-shrink-0">
        <Sun
          className={`absolute inset-0 transition-all duration-300 ${
            theme === "dark"
              ? "rotate-0 scale-100 opacity-100"
              : "rotate-90 scale-0 opacity-0"
          }`}
        />
        <Moon
          className={`absolute inset-0 transition-all duration-300 ${
            theme === "light"
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0"
          }`}
        />
      </div>

      {!isCollapsed && (
        <div className="relative flex items-center justify-between flex-1">
          <span className="text-sm font-medium">
            {theme === "dark" ? "Dark Mode" : "Light Mode"}
          </span>
          {/* Toggle Indicator */}
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-5 rounded-full bg-[#1a1a1a] border border-[#2d3e2d]/20 transition-colors duration-300">
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-gradient-to-br from-[#2d3e2d] to-[#1a1a1a] border border-[#4a6a4a]/30 shadow-lg transition-transform duration-300 ${
                  theme === "dark" ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>
          </div>
        </div>
      )}
    </button>
  );
}
