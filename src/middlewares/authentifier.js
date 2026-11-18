import { Interdit, NonAuthentifie } from "../erreurs.js";
import { verifierAccess } from "../services/jetons.js";

/**
 * Exige un access token valide dans l'en-tête « Authorization: Bearer <jeton> ».
 * Place { id, role } dans req.utilisateur. Toute erreur de jeton donne 401, jamais 500.
 */
export function authentifier(jwt) {
  return async (req, _res, next) => {
    const [schema, jeton] = (req.get("authorization") ?? "").split(" ");
    if (schema !== "Bearer" || !jeton) {
      return next(new NonAuthentifie("Jeton d'accès manquant"));
    }
    try {
      req.utilisateur = await verifierAccess(jwt, jeton);
    } catch {
      return next(new NonAuthentifie("Jeton d'accès invalide ou expiré"));
    }
    next();
  };
}

/** À placer après authentifier : 403 si le rôle de l'utilisateur n'est pas autorisé. */
export function exigerRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.utilisateur?.role)) {
      return next(new Interdit("Rôle insuffisant pour cette opération"));
    }
    next();
  };
}

export const estBibliothecaire = (utilisateur) => utilisateur.role === "bibliothecaire";
