import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db";

import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { PRO_UPGRADE_ENABLED } from "@/module/payment/config/flags";
import { polarClient } from "@/module/payment/config/polar";
import { SubscriptionTier, updatePolarCustomerId, updateUserTier } from "@/module/payment/lib/subscription";

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_BASE_URL,
  "http://localhost:3000",
].filter((value): value is string => Boolean(value));

function toSubscriptionTier(value: string | null | undefined): SubscriptionTier {
  return value === "PRO" ? "PRO" : "FREE";
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql", // or "mysql", "postgresql", ...etc
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scope: ["repo"],
    },
  },
  trustedOrigins,
  plugins: [
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      use: [
        portal({
          returnUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000/dashboard",
        }),
        ...(PRO_UPGRADE_ENABLED
          ? [
              checkout({
                products: [
                  {
                    productId: "26c98044-07ef-43bc-97a6-6485e7794b3f",
                    slug: "pro", // Custom slug for easy reference in Checkout URL, e.g. /checkout/hreviewer-new-dev
                  },
                ],
                successUrl: process.env.POLAR_SUCCESS_URL || "dashboard/subscription?success=true",
                authenticatedUsersOnly: true,
              }),
            ]
          : []),
        usage(),
        webhooks({
          secret: process.env.POLAR_WEBHOOK_SECRET!,
          onSubscriptionActive: async (payload) => {
            const customerId = payload.data.customerId;

            const user = await prisma.user.findUnique({
              where: {
                polarCustomerId: customerId,
              },
            });

            if (user) {
              await updateUserTier(user.id, "PRO", "ACTIVE", payload.data.id);
            }
          },
          onSubscriptionCanceled: async (payload) => {
            const customerId = payload.data.customerId;

            const user = await prisma.user.findUnique({
              where: {
                polarCustomerId: customerId,
              },
            });

            if (user) {
              await updateUserTier(user.id, toSubscriptionTier(user.subscriptionTier), "CANCELLED");
            }
          },
          onSubscriptionRevoked: async (payload) => {
            const customerId = payload.data.customerId;

            const user = await prisma.user.findUnique({
              where: {
                polarCustomerId: customerId,
              },
            });

            if (user) {
              await updateUserTier(user.id, "FREE", "EXPIRED");
            }
          },
          onOrderPaid: async () => {},
          onCustomerCreated: async (payload) => {
            const user = await prisma.user.findUnique({
              where: {
                email: payload.data.email,
              },
            });

            if (user) {
              await updatePolarCustomerId(user.id, payload.data.id);
            }
          },
        }),
      ],
    }),
  ],
});
