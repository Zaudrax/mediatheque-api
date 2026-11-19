import type { Role } from "../generated/prisma/enums.ts";

export type { Role };

/** Utilisateur authentifié, tel que lu dans l'access token. */
export interface UtilisateurConnecte {
  id: number;
  role: Role;
}

/** Restreint une requête aux lignes d'un membre ; vide pour un bibliothécaire. */
export type PorteeEmprunts = { emprunteurId?: number };

export interface Page<T> {
  donnees: T[];
  total: number;
}
