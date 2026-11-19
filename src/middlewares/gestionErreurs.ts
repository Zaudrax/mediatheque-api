import type { ErrorRequestHandler } from "express";
import { errors as erreursJose } from "jose";
import { ZodError } from "zod";
import { ErreurApi } from "../erreurs.ts";
import { Prisma } from "../generated/prisma/client.ts";

/** Codes Prisma traduits en HTTP. */
const ERREURS_PRISMA: Record<string, { statut: number; message: string }> = {
  P2025: { statut: 404, message: "Ressource introuvable" },
  P2003: {
    statut: 409,
    message: "Opération impossible : la ressource est référencée par d'autres données",
  },
  P2002: { statut: 409, message: "Une ressource avec ces valeurs existe déjà" },
};

const typeErreurCorps = (err: unknown): string | undefined =>
  typeof err === "object" && err !== null && "type" in err && typeof err.type === "string"
    ? err.type
    : undefined;

/**
 * Gestionnaire d'erreurs central : répond toujours en JSON, sans jamais exposer la pile d'exécution.
 * Les erreurs inattendues sont journalisées côté serveur et renvoyées en 500 générique.
 */
export const gestionErreurs: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    const source = (err as ZodError & { source?: string }).source;
    res.status(400).json({
      erreur: "Validation échouée",
      details: err.issues.map((issue) => ({
        champ: [source, ...issue.path.map(String)].filter(Boolean).join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof ErreurApi) {
    if (err.entetes) res.set(err.entetes);
    res.status(err.statut).json(err.details ? { erreur: err.message, details: err.details } : { erreur: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const correspondance = ERREURS_PRISMA[err.code];
    if (correspondance) {
      res.status(correspondance.statut).json({ erreur: correspondance.message });
      return;
    }
  }

  // Filet de sécurité : une erreur de vérification de jeton donne toujours 401, jamais 500.
  if (err instanceof erreursJose.JOSEError) {
    res.set("WWW-Authenticate", 'Bearer realm="mediatheque-api"');
    res.status(401).json({ erreur: "Jeton invalide ou expiré" });
    return;
  }

  // JSON mal formé ou corps trop volumineux (erreurs levées par express.json()).
  const type = typeErreurCorps(err);
  if (type === "entity.parse.failed") {
    res.status(400).json({ erreur: "Corps de requête JSON mal formé" });
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ erreur: "Corps de requête trop volumineux" });
    return;
  }

  // Le détail ne part que dans la console du serveur (nom, code et pile, jamais le corps de la requête).
  console.error(`${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ erreur: "Erreur interne du serveur" });
};
