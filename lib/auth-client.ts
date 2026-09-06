import { polarClient } from "@polar-sh/better-auth";
import { createAuthClient } from "better-auth/react";

export const { signIn, useSession, signOut, customer, checkout } = createAuthClient({
  plugins: [polarClient()],
});
