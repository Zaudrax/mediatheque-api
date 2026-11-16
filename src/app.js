import express from "express";
import { prisma } from "./db.js";
import { gestionErreurs } from "./middlewares/gestionErreurs.js";
import { journal } from "./middlewares/journal.js";
import { routeInconnue } from "./middlewares/routeInconnue.js";
import { routeurEmprunts } from "./routes/emprunts.js";
import { routeurOuvrages } from "./routes/ouvrages.js";

/** L'application est construite ici, sans écouter de port : index.js s'en charge. */
export const app = express();

app.disable("x-powered-by");
app.use(journal);
app.use(express.json({ limit: "100kb" }));

app.get("/sante", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ statut: "ok", baseDeDonnees: "ok" });
  } catch {
    res.status(503).json({ statut: "degrade", baseDeDonnees: "injoignable" });
  }
});

app.use("/api/ouvrages", routeurOuvrages);
app.use("/api/emprunts", routeurEmprunts);

app.use(routeInconnue);
app.use(gestionErreurs);
