import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
  datasource: {
    // process.env plutôt que env() : `prisma generate` (lancé par npm ci) doit
    // fonctionner même avant la création du fichier .env.
    url: process.env.DATABASE_URL,
  },
});
