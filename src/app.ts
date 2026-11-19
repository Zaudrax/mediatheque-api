import express, { type Express } from "express";
import { type Config, lireConfig } from "./config.ts";
import { prisma } from "./db.ts";
import { authentifier } from "./middlewares/authentifier.ts";
import { gestionErreurs } from "./middlewares/gestionErreurs.ts";
import { journal } from "./middlewares/journal.ts";
import { routeInconnue } from "./middlewares/routeInconnue.ts";
import { corsRestreint, entetesSecurite, limiteurDebit } from "./middlewares/securite.ts";
import { routeurAuth } from "./routes/auth.ts";
import { routeurEmprunts } from "./routes/emprunts.ts";
import { routeurOuvrages } from "./routes/ouvrages.ts";

/**
 * Construit l'application sans écouter de port : index.ts s'en charge, les tests aussi
 * (sur un port éphémère). Chaque appel crée ses propres compteurs de limitation de débit.
 */
export function creerApp(config: Config = lireConfig()): Express {
  const app = express();
  const authentifie = authentifier(config.jwt);

  app.disable("x-powered-by");
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  app.use(journal);
  app.use(entetesSecurite());
  app.use(corsRestreint(config.corsOrigins));
  app.use(limiteurDebit(config.limites.generale));
  app.use(express.json({ limit: "100kb" }));

  app.get("/sante", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ statut: "ok", baseDeDonnees: "ok" });
    } catch {
      res.status(503).json({ statut: "degrade", baseDeDonnees: "injoignable" });
    }
  });

  app.use("/api/auth", limiteurDebit(config.limites.auth), routeurAuth(config));
  app.use("/api/ouvrages", authentifie, routeurOuvrages());
  app.use("/api/emprunts", authentifie, routeurEmprunts());

  app.use(routeInconnue);
  app.use(gestionErreurs);

  return app;
}
