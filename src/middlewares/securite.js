import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { Interdit } from "../erreurs.js";

export function entetesSecurite() {
  return helmet();
}

/**
 * CORS limité aux origines listées dans CORS_ORIGINS.
 * Une requête sans en-tête Origin (application mobile, curl) n'est pas concernée.
 * Une origine non déclarée reçoit 403.
 */
export function corsRestreint(originesAutorisees) {
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

/** Chaque appel crée un compteur indépendant (en mémoire, par adresse IP). */
export function limiteurDebit({ max, fenetreMs }) {
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
