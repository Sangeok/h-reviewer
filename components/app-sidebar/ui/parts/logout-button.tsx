import { LogOut } from "lucide-react";
import type { LogoutButtonProps } from "../../types";

export function LogoutButton({ isCollapsed, onLogout }: LogoutButtonProps) {
  return (
    <button
      onClick={onLogout}
      className="group w-full flex items-center gap-3 rounded-xl px-3 py-3 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
    >
      <LogOut className="h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!isCollapsed && <span className="text-sm font-medium">Logout</span>}
    </button>
  );
}
