import { z } from "zod";

const secret = z
  .string({ error: "est obligatoire" })
  .min(32, "doit contenir au moins 32 caractères (voir README : génération des secrets)");

const entier = (defaut) => z.coerce.number().int().positive().default(defaut);

const schemaConfig = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: entier(3000),
  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: secret,
  ACCESS_TOKEN_DUREE: z.string().default("15m"),
  REFRESH_TOKEN_DUREE_JOURS: entier(7),
  CORS_ORIGINS: z.string().default(""),
  LIMITE_AUTH_MAX: entier(10),
  LIMITE_AUTH_FENETRE_MS: entier(15 * 60 * 1000),
  LIMITE_GENERALE_MAX: entier(300),
  LIMITE_GENERALE_FENETRE_MS: entier(60 * 1000),
  // Nombre de proxys de confiance devant l'API (0 en accès direct) : sert à lire la vraie IP.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

/**
 * Lit et valide la configuration depuis l'environnement.
 * Une variable manquante ou invalide arrête le démarrage avec un message explicite.
 */
export function lireConfig(env = process.env) {
  const resultat = schemaConfig.safeParse(env);
  if (!resultat.success) {
    const lignes = resultat.error.issues.map((i) => `  - ${i.path.join(".")} : ${i.message}`);
    throw new Error(`Configuration invalide :\n${lignes.join("\n")}`);
  }
  const c = resultat.data;
  return {
    env: c.NODE_ENV,
    port: c.PORT,
    jwt: {
      secretAccess: new TextEncoder().encode(c.JWT_ACCESS_SECRET),
      secretRefresh: new TextEncoder().encode(c.JWT_REFRESH_SECRET),
      dureeAccess: c.ACCESS_TOKEN_DUREE,
      dureeRefreshJours: c.REFRESH_TOKEN_DUREE_JOURS,
      emetteur: "mediatheque-api",
      audience: "mediatheque-mobile",
    },
    corsOrigins: c.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    limites: {
      auth: { max: c.LIMITE_AUTH_MAX, fenetreMs: c.LIMITE_AUTH_FENETRE_MS },
      generale: { max: c.LIMITE_GENERALE_MAX, fenetreMs: c.LIMITE_GENERALE_FENETRE_MS },
    },
    trustProxy: c.TRUST_PROXY,
  };
}
