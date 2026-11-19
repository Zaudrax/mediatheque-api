import type { Request, RequestHandler } from "express";
import type { ConfigJwt } from "../config.ts";
import { Interdit, NonAuthentifie } from "../erreurs.ts";
import { verifierAccess } from "../services/jetons.ts";
import type { PorteeEmprunts, Role, UtilisateurConnecte } from "../types/domaine.ts";

/**
 * Exige un access token valide dans l'en-tête « Authorization: Bearer <jeton> ».
 * Place { id, role } dans req.utilisateur. Toute erreur de jeton donne 401, jamais 500.
 */
export function authentifier(jwt: ConfigJwt): RequestHandler {
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
export function exigerRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.utilisateur || !roles.includes(req.utilisateur.role)) {
      return next(new Interdit("Rôle insuffisant pour cette opération"));
    }
    next();
  };
}

/** Utilisateur connecté d'une route protégée (garantie par authentifier()). */
export function utilisateurDe(req: Request): UtilisateurConnecte {
  if (!req.utilisateur) throw new NonAuthentifie();
  return req.utilisateur;
}

export const estBibliothecaire = (utilisateur: UtilisateurConnecte): boolean =>
  utilisateur.role === "bibliothecaire";

/** Un membre n'accède qu'à ses lignes ; un bibliothécaire à toutes. */
export const porteeEmprunts = (u: UtilisateurConnecte): PorteeEmprunts =>
  estBibliothecaire(u) ? {} : { emprunteurId: u.id };
