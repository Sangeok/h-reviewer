import { SIDEBAR_CONFIG } from "../../constants/config";
import type { FooterProps } from "../../types";

export function Footer({ isCollapsed }: FooterProps) {
  if (isCollapsed) return null;

  return (
    <div className="mt-4 text-center">
      <p className="text-xs text-gray-600 font-mono">
        {SIDEBAR_CONFIG.version} • {SIDEBAR_CONFIG.year}
      </p>
    </div>
  );
}
