import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";
import type { Prisma } from "./generated/prisma/client.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("La variable d'environnement DATABASE_URL est manquante (voir .env.example).");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

/** Client utilisable hors transaction (prisma) ou dans une transaction (tx). */
export type ClientDb = typeof prisma | Prisma.TransactionClient;
