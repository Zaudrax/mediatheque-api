import type { Request, RequestHandler, Response } from "express";
import type { z } from "zod";

type Source = "params" | "query" | "body";
export type Schemas = Partial<Record<Source, z.ZodType>>;

/** Types des valeurs validées, dérivés des schémas Zod. */
export type Entrees<S extends Schemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

/**
 * Valide req.params, req.query et req.body avec des schémas Zod, puis appelle le gestionnaire
 * avec les valeurs nettoyées et typées (types convertis, champs inconnus retirés).
 * En Express 5, req.query est en lecture seule : on ne le réécrit pas.
 * En cas d'échec, l'erreur Zod est transmise au gestionnaire d'erreurs (→ 400).
 */
export function valider<S extends Schemas>(
  schemas: S,
  gestionnaire: (entree: Entrees<S>, req: Request, res: Response) => unknown,
): RequestHandler {
  return async (req, res, next) => {
    const entree: Partial<Record<Source, unknown>> = {};
    for (const source of ["params", "query", "body"] as const) {
      const schema = schemas[source];
      if (!schema) continue;
      // Corps absent : on valide un objet vide pour obtenir des messages par champ.
      const brut: unknown = source === "body" ? (req.body ?? {}) : req[source];
      const resultat = schema.safeParse(brut);
      if (!resultat.success) {
        return next(Object.assign(resultat.error, { source }));
      }
      entree[source] = resultat.data;
    }
    req.valide = entree;
    await gestionnaire(entree as Entrees<S>, req, res);
  };
}
