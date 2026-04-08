import { LayoutDashboard, FolderGit2, FileCheck, Settings, CreditCard } from "lucide-react";
import type { NavItem } from "../types";

export { SIDEBAR_CONFIG, ANIMATION_CONFIG, THEME_CONFIG } from "./config";
export { SIDEBAR_STYLES } from "./styles";

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
    title: "Subscription",
    url: "/dashboard/subscription",
    icon: CreditCard,
  },
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings,
  },
];
