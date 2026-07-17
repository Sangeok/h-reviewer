import { LoginUI, requireUnAuth } from "@/features/auth";

export default async function LoginPage() {
  await requireUnAuth();
  return <LoginUI />;
}
