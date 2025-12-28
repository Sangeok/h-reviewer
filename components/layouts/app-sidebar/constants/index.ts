import {
  LayoutDashboard,
  FolderGit2,
  FileCheck,
  Settings
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Repository",
    url: "/dashboard/repository",
    icon: FolderGit2,
  },
  {
    title: "Reviews",
    url: "/dashboard/reviews",
    icon: FileCheck,
  },
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings,
  }
];