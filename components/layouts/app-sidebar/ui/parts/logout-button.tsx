import { LogOut } from "lucide-react";
import type { LogoutButtonProps } from "../../types";

export function LogoutButton({ isCollapsed, onLogout }: LogoutButtonProps) {
  return (
    <button
      onClick={onLogout}
      className="group w-full flex items-center gap-3 rounded-lg px-3 py-3 text-[#707070] hover:bg-[#2a1a1a] hover:text-[#ff6b6b] transition-all duration-300 relative overflow-hidden"
    >
      {/* Subtle red shimmer on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#3a1a1a]/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

      <LogOut className="h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110" />
      {!isCollapsed && <span className="text-sm font-medium relative">Logout</span>}
    </button>
  );
}
