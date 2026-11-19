import type { Message } from "./types.ts";

/** Nombre d'échanges (question + réponse) conservés par utilisateur. */
export const ECHANGES_MAX = 10;

/**
 * Mémoire de conversation, indexée par l'identifiant de l'utilisateur authentifié
 * (jamais par une valeur fournie par le client). Conservée dans le processus :
 * elle disparaît au redémarrage et n'est pas partagée entre plusieurs instances.
 */
export class MemoireConversations {
  #conversations = new Map<number, Message[]>();

  lire(utilisateurId: number): Message[] {
    return [...(this.#conversations.get(utilisateurId) ?? [])];
  }

  /** Ajoute un échange et tronque aux ECHANGES_MAX derniers (chaque tour renvoie tout l'historique au modèle). */
  ajouter(utilisateurId: number, question: string, reponse: string): void {
    const messages = this.lire(utilisateurId);
    messages.push({ role: "user", content: question }, { role: "assistant", content: reponse });
    this.#conversations.set(utilisateurId, messages.slice(-ECHANGES_MAX * 2));
  }

  effacer(utilisateurId: number): void {
    this.#conversations.delete(utilisateurId);
  }
}
