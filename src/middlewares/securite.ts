import cors from "cors";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Fenetre } from "../config.ts";
import { Interdit } from "../erreurs.ts";

/**
 * En-têtes de sécurité. La CSP par défaut de helmet convient à l'API comme à Swagger UI,
 * dont les scripts et feuilles de style sont servis par l'API elle-même.
 */
export function entetesSecurite(): RequestHandler {
  return helmet();
}

/**
 * CORS limité aux origines listées dans CORS_ORIGINS.
 * Une requête sans en-tête Origin (application mobile, curl) n'est pas concernée.
 * Une origine non déclarée reçoit 403.
 */
export function corsRestreint(originesAutorisees: string[]): RequestHandler {
  return cors({
    origin(origine, rappel) {
      if (!origine || originesAutorisees.includes(origine)) return rappel(null, true);
      rappel(new Interdit("Origine non autorisée"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Location", "RateLimit", "RateLimit-Policy", "Retry-After"],
    maxAge: 600,
  });
}

/**
 * Chaque appel crée un compteur indépendant, en mémoire.
 * Par défaut la clé est l'adresse IP ; `cle` permet de compter par utilisateur.
 */
export function limiteurDebit({ max, fenetreMs }: Fenetre): RequestHandler {
  return rateLimit({
    windowMs: fenetreMs,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ erreur: "Trop de requêtes, réessayez plus tard" });
    },
  });
}
