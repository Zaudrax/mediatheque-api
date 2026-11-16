/**
 * Valide req.params, req.query et req.body avec des schémas Zod.
 * Les valeurs nettoyées (types convertis, champs inconnus retirés) sont rangées dans req.valide.
 * En Express 5, req.query est en lecture seule : on ne le réécrit pas.
 * En cas d'échec, l'erreur Zod est transmise au gestionnaire d'erreurs (→ 400).
 *
 * @param {{ params?: import("zod").ZodType, query?: import("zod").ZodType, body?: import("zod").ZodType }} schemas
 */
export function valider(schemas) {
  return (req, _res, next) => {
    req.valide = {};
    for (const source of ["params", "query", "body"]) {
      if (!schemas[source]) continue;
      // Corps absent ou non JSON : on valide un objet vide pour obtenir des messages par champ.
      const entree = source === "body" ? (req.body ?? {}) : req[source];
      const resultat = schemas[source].safeParse(entree);
      if (!resultat.success) {
        resultat.error.source = source;
        return next(resultat.error);
      }
      req.valide[source] = resultat.data;
    }
    next();
  };
}
