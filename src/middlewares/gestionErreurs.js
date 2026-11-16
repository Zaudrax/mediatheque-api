import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.ts";
import { ErreurApi } from "../erreurs.js";

/** Codes Prisma traduits en HTTP. */
const ERREURS_PRISMA = {
  P2025: { statut: 404, message: "Ressource introuvable" },
  P2003: { statut: 409, message: "Opération impossible : la ressource est référencée par d'autres données" },
  P2002: { statut: 409, message: "Une ressource avec ces valeurs existe déjà" },
};

/**
 * Gestionnaire d'erreurs central : répond toujours en JSON, sans jamais exposer la pile d'exécution.
 * Les erreurs inattendues sont journalisées côté serveur et renvoyées en 500 générique.
 */
// eslint-disable-next-line no-unused-vars
export function gestionErreurs(err, req, res, _next) {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    return res.status(400).json({
      erreur: "Validation échouée",
      details: err.issues.map((issue) => ({
        champ: [err.source, ...issue.path].filter(Boolean).join("."),
        message: issue.message,
      })),
    });
  }

  if (err instanceof ErreurApi) {
    const corps = { erreur: err.message };
    if (err.details) corps.details = err.details;
    return res.status(err.statut).json(corps);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && ERREURS_PRISMA[err.code]) {
    const { statut, message } = ERREURS_PRISMA[err.code];
    return res.status(statut).json({ erreur: message });
  }

  // JSON mal formé ou corps trop volumineux (erreurs levées par express.json()).
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erreur: "Corps de requête JSON mal formé" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ erreur: "Corps de requête trop volumineux" });
  }

  console.error(`${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ erreur: "Erreur interne du serveur" });
}
