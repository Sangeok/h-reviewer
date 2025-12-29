import { Logout, requireAuth } from "@/module/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  await requireAuth();
  return redirect("/dashboard");

  return (
    <div>
      <Logout>
        <button className="bg-red-500 text-white p-2 rounded-md">Logout</button>
      </Logout>
    </div>
  );
}
