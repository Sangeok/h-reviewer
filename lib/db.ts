import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Prisma adapter for PostgreSQL
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prismaClientSingleton = () => {
  return new PrismaClient({
    adapter,
  });
};

// Global variable to prevent multiple instances of Prisma Client in development
declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

// Prisma Client instance
const prisma = globalThis.prismaGlobal || prismaClientSingleton();

// Prevent multiple instances of Prisma Client in development
if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export default prisma;
