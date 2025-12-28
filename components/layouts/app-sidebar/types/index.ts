import { LucideIcon } from "lucide-react";

export interface SidebarProps {
  defaultCollapsed?: boolean;
  className?: string;
}

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export interface NavItemProps {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
}

export interface UserProfileProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  isCollapsed: boolean;
}

export interface UserAvatarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  size?: "sm" | "md" | "lg";
  showBorder?: boolean;
  className?: string;
}

export interface LogoProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export interface ThemeToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export interface LogoutButtonProps {
  isCollapsed: boolean;
  onLogout: () => void;
}

export interface FooterProps {
  isCollapsed: boolean;
}

export interface NavigationProps {
  isCollapsed: boolean;
}
