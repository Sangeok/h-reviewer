import { LoginUI, requireUnAuth } from "@/module/auth";

export default async function LoginPage() {
  await requireUnAuth();
  return <LoginUI />;
}
