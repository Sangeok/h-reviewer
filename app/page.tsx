import Logout from "@/module/auth/components/logout";
import { requireAuth } from "@/module/auth/utils/auth-utils";

export default async function Home() {
  await requireAuth();

  return (
    <div>
      <Logout>
        <button className="bg-red-500 text-white p-2 rounded-md">Logout</button>
      </Logout>
    </div>
  );
}
