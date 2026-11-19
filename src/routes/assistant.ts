import { Router } from "express";
import type { Config } from "../config.ts";
import { utilisateurDe } from "../middlewares/authentifier.ts";
import { limiteurDebit } from "../middlewares/securite.ts";
import { valider } from "../middlewares/valider.ts";
import { question } from "../schemas/assistant.ts";
import type { Assistant } from "../services/assistant/index.ts";

/** Une trame SSE ; les données sont sérialisées en JSON pour préserver les retours à la ligne. */
const trame = (donnees: unknown, evenement?: string) =>
  `${evenement ? `event: ${evenement}\n` : ""}data: ${JSON.stringify(donnees)}\n\n`;

/** Monté derrière authentifier(). */
export function routeurAssistant(config: Config, assistant: Assistant): Router {
  const routeur = Router();

  // 10 appels par minute et par utilisateur authentifié (et non par IP).
  const limiteur = limiteurDebit(config.limites.assistant, (req) => `utilisateur:${utilisateurDe(req).id}`);

  /**
   * Réponse diffusée en Server-Sent Events :
   *   event: outil   data: {"nom": "..."}        (un outil est consulté)
   *   data: {"delta": "..."}                     (morceaux de texte, autant que nécessaire)
   *   event: fin     data: {"jetons": {...}}      (fin normale)
   *   event: erreur  data: {"message": "..."}    (échec du fournisseur, sans détail interne)
   * Si le client ferme la connexion, la génération est interrompue (plus de jetons consommés).
   */
  routeur.post(
    "/flux",
    limiteur,
    valider({ body: question }, async ({ body }, req, res) => {
      const utilisateur = utilisateurDe(req);
      res.set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();

      const annulation = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) annulation.abort(new Error("Client déconnecté"));
      });

      const jetons = { entree: 0, sortie: 0 };
      try {
        for await (const evenement of assistant.repondreEnFlux(utilisateur, body.question, annulation.signal)) {
          if (evenement.type === "texte") res.write(trame({ delta: evenement.delta }));
          else if (evenement.type === "outil") res.write(trame({ nom: evenement.nom }, "outil"));
          else {
            jetons.entree += evenement.entree;
            jetons.sortie += evenement.sortie;
          }
        }
        res.write(trame({ jetons }, "fin"));
      } catch (err) {
        if (!annulation.signal.aborted) {
          console.error(`assistant utilisateur=${utilisateur.id} échec du fournisseur`, err);
          res.write(trame({ message: "Assistant momentanément indisponible" }, "erreur"));
        }
      } finally {
        res.end();
      }
    }),
  );

  routeur.delete("/memoire", (req, res) => {
    assistant.effacerMemoire(utilisateurDe(req).id);
    res.status(204).end();
  });

  return routeur;
}
