import express from "express";
import { lireConfig } from "./config.js";
import { prisma } from "./db.js";
import { authentifier } from "./middlewares/authentifier.js";
import { gestionErreurs } from "./middlewares/gestionErreurs.js";
import { journal } from "./middlewares/journal.js";
import { routeInconnue } from "./middlewares/routeInconnue.js";
import { corsRestreint, entetesSecurite, limiteurDebit } from "./middlewares/securite.js";
import { routeurAuth } from "./routes/auth.js";
import { routeurEmprunts } from "./routes/emprunts.js";
import { routeurOuvrages } from "./routes/ouvrages.js";

/**
 * Construit l'application sans écouter de port : index.js s'en charge, les tests aussi
 * (sur un port éphémère). Chaque appel crée ses propres compteurs de limitation de débit.
 */
export function creerApp(config = lireConfig()) {
  const app = express();

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
  app.use("/api/ouvrages", authentifier(config.jwt), routeurOuvrages);
  app.use("/api/emprunts", authentifier(config.jwt), routeurEmprunts);

  app.use(routeInconnue);
  app.use(gestionErreurs);

  return app;
}
