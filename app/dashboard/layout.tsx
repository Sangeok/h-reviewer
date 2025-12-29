import AppSidebar from "@/components/layouts/app-sidebar/ui/app-sidebar";
import { requireAuth } from "@/module/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
