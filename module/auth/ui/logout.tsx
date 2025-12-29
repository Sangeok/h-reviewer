"use client";

import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function Logout({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    });
  };

  return (
    <span className={className} onClick={handleLogout}>
      {children}
    </span>
  );
}
