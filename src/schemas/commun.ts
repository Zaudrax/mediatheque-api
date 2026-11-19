import { z } from "zod";

// Messages d'erreur Zod en français.
z.config(z.locales.fr());

const INT4_MAX = 2_147_483_647;

/** Identifiant entier strictement positif, lu depuis l'URL (chaîne) ou le corps (nombre). */
export const identifiant = z.coerce
  .number({ error: "doit être un entier" })
  .int("doit être un entier")
  .positive("doit être strictement positif")
  .max(INT4_MAX, "identifiant trop grand")
  .meta({ example: 1 });

export const paramsId = z.object({ id: identifiant.meta({ description: "Identifiant de la ressource" }) });

/** Date ISO 8601 : « 2026-11-16 » ou « 2026-11-16T10:30:00Z », convertie en Date. */
export const dateIso = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })], {
    error: "doit être une date ISO 8601 (AAAA-MM-JJ ou AAAA-MM-JJTHH:MM:SSZ)",
  })
  .transform((valeur) => new Date(valeur))
  .meta({ description: "Date ISO 8601 (AAAA-MM-JJ ou date-heure avec fuseau)", example: "2026-12-07" });

/** Booléen passé en query string : « true » ou « false ». */
export const booleenQuery = z
  .enum(["true", "false"], { error: "doit valoir true ou false" })
  .transform((valeur) => valeur === "true");

export const LIMITE_MAX = 50;

/** ?page=&limite= — la limite est plafonnée à 50. */
export const pagination = {
  page: z.coerce
    .number()
    .int("doit être un entier")
    .min(1)
    .max(INT4_MAX)
    .default(1)
    .meta({ description: "Numéro de page, à partir de 1" }),
  limite: z.coerce
    .number()
    .int("doit être un entier")
    .min(1)
    .default(10)
    .transform((limite) => Math.min(limite, LIMITE_MAX))
    .meta({ description: "Éléments par page (plafonnée à 50)" }),
};

/** Construit la réponse paginée commune aux listes. */
export function reponsePaginee<T>(page: { donnees: T[]; total: number }, numero: number, limite: number) {
  return {
    donnees: page.donnees,
    pagination: { page: numero, limite, total: page.total, pages: Math.ceil(page.total / limite) },
  };
}

// ---------------------------------------------------------------------------
// Schémas de réponse (documentation OpenAPI)
// ---------------------------------------------------------------------------

export const dateReponse = z.iso.datetime().meta({ example: "2026-11-16T10:21:49.884Z" });

export const Pagination = z
  .object({
    page: z.number().int(),
    limite: z.number().int(),
    total: z.number().int(),
    pages: z.number().int(),
  })
  .meta({ id: "Pagination" });

export const listePaginee = <T extends z.ZodType>(element: T) =>
  z.object({ donnees: z.array(element), pagination: Pagination });

export const Erreur = z
  .object({
    erreur: z.string().meta({ example: "Ressource introuvable" }),
    details: z
      .array(z.object({ champ: z.string(), message: z.string() }))
      .optional()
      .meta({ description: "Champs fautifs (erreurs de validation)" }),
  })
  .meta({ id: "Erreur" });
