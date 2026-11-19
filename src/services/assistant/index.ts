import type { ConfigIa } from "../../config.ts";
import type { UtilisateurConnecte } from "../../types/domaine.ts";
import { creerFournisseurBouchon } from "./bouchon.ts";
import { MemoireConversations } from "./memoire.ts";
import { creerFournisseurOpenai } from "./openai.ts";
import { creerOutils } from "./outils.ts";
import type { EvenementIa, FournisseurIa } from "./types.ts";

const INSTRUCTIONS = [
  "Vous êtes l'assistant de la médiathèque associative. Répondez en français, brièvement.",
  "Utilisez les outils avant d'affirmer qu'un ouvrage existe ou qu'il est disponible.",
  "Vous ne connaissez que l'utilisateur connecté : ne parlez jamais des emprunts ou réservations d'autres personnes.",
  "Si une question sort du cadre de la médiathèque, dites-le poliment.",
].join("\n");

export interface Assistant {
  readonly fournisseur: FournisseurIa["nom"];
  repondreEnFlux(
    utilisateur: UtilisateurConnecte,
    question: string,
    signal: AbortSignal,
  ): AsyncGenerator<EvenementIa>;
  effacerMemoire(utilisateurId: number): void;
}

/** Choisit l'implémentation selon IA_FOURNISSEUR ; la mémoire est propre à chaque instance. */
export function creerAssistant(config: ConfigIa, fournisseur?: FournisseurIa): Assistant {
  const ia = fournisseur ?? (config.fournisseur === "openai" ? creerFournisseurOpenai(config) : creerFournisseurBouchon());
  const memoire = new MemoireConversations();

  return {
    fournisseur: ia.nom,

    async *repondreEnFlux(utilisateur, question, signal) {
      const jetons = { entree: 0, sortie: 0 };
      let reponse = "";
      let termine = false;
      try {
        for await (const evenement of ia.repondreEnFlux({
          instructions: INSTRUCTIONS,
          historique: memoire.lire(utilisateur.id),
          question,
          outils: creerOutils(utilisateur),
          signal,
        })) {
          if (evenement.type === "jetons") {
            jetons.entree += evenement.entree;
            jetons.sortie += evenement.sortie;
          }
          if (evenement.type === "texte") reponse += evenement.delta;
          yield evenement;
        }
        termine = true;
        memoire.ajouter(utilisateur.id, question, reponse);
      } finally {
        // Un appel par ligne : c'est la facture. Ni la question ni la réponse ne sont journalisées.
        console.log(
          `assistant utilisateur=${utilisateur.id} fournisseur=${ia.nom} ` +
            `jetons_entree=${jetons.entree} jetons_sortie=${jetons.sortie} ` +
            `statut=${termine ? "termine" : "interrompu"}`,
        );
      }
    },

    effacerMemoire(utilisateurId) {
      memoire.effacer(utilisateurId);
    },
  };
}
