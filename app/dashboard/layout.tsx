import { requireAuth } from "@/module/auth/utils/auth-utils";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <div>{children}</div>;
}
