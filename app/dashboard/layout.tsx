import AppSidebar from "@/components/app-sidebar/ui/app-sidebar";
import { requireAuth } from "@/module/auth/utils/auth-utils";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
