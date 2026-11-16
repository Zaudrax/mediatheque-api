import { z } from "zod";

// Messages d'erreur Zod en français.
z.config(z.locales.fr());

const INT4_MAX = 2_147_483_647;

/** Identifiant entier strictement positif, lu depuis l'URL (chaîne) ou le corps (nombre). */
export const identifiant = z.coerce
  .number({ error: "doit être un entier" })
  .int("doit être un entier")
  .positive("doit être strictement positif")
  .max(INT4_MAX, "identifiant trop grand");

export const paramsId = z.object({ id: identifiant });

/** Date ISO 8601 : « 2026-11-16 » ou « 2026-11-16T10:30:00Z », convertie en Date. */
export const dateIso = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })], {
    error: "doit être une date ISO 8601 (AAAA-MM-JJ ou AAAA-MM-JJTHH:MM:SSZ)",
  })
  .transform((valeur) => new Date(valeur));

/** Booléen passé en query string : « true » ou « false ». */
export const booleenQuery = z
  .enum(["true", "false"], { error: "doit valoir true ou false" })
  .transform((valeur) => valeur === "true");

export const LIMITE_MAX = 50;

/** ?page=&limite= — la limite est plafonnée à 50. */
export const pagination = {
  page: z.coerce.number().int("doit être un entier").min(1).max(INT4_MAX).default(1),
  limite: z.coerce
    .number()
    .int("doit être un entier")
    .min(1)
    .default(10)
    .transform((limite) => Math.min(limite, LIMITE_MAX)),
};

/** Construit la réponse paginée commune aux listes. */
export function reponsePaginee({ donnees, total, page, limite }) {
  return {
    donnees,
    pagination: { page, limite, total, pages: Math.ceil(total / limite) },
  };
}
