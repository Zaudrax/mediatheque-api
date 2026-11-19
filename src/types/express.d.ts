import type { UtilisateurConnecte } from "./domaine.ts";

declare global {
  namespace Express {
    interface Request {
      /** Renseigné par le middleware authentifier(). */
      utilisateur?: UtilisateurConnecte;
      /** Valeurs validées et converties par le middleware valider(). */
      valide?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}

export {};
