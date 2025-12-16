import LoginUI from "@/module/auth/components/login-ui";
import { requireUnAuth } from "@/module/auth/utils/auth-utils";

export default async function LoginPage() {
  await requireUnAuth();
  return <LoginUI />;
}
