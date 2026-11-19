import OpenAI from "openai";
import type { FunctionTool, ResponseInputItem } from "openai/resources/responses/responses";
import type { ConfigIa } from "../../config.ts";
import type { EvenementIa, FournisseurIa, RequeteIa } from "./types.ts";

/** Nombre maximal d'allers-retours modèle ↔ outils par question : borne le coût. */
const TOURS_MAX = 3;

/**
 * Fournisseur OpenAI (API Responses, streaming et function calling).
 * Le modèle demande un outil ; le serveur valide les arguments et l'exécute avec les droits
 * de l'utilisateur ; le résultat est renvoyé au modèle, qui rédige la réponse.
 */
export function creerFournisseurOpenai(config: ConfigIa): FournisseurIa {
  const client = new OpenAI({ apiKey: config.cleOpenai });

  return {
    nom: "openai",
    async *repondreEnFlux({ instructions, historique, question, outils, signal }: RequeteIa) {
      const outilsOpenai: FunctionTool[] = outils.map((o) => ({
        type: "function",
        name: o.nom,
        description: o.description,
        parameters: o.parametres,
        strict: false,
      }));

      const entree: ResponseInputItem[] = [
        ...historique.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ];

      for (let tour = 0; tour < TOURS_MAX; tour++) {
        const flux = await client.responses.create(
          {
            model: config.modele,
            instructions,
            input: entree,
            tools: outilsOpenai,
            max_output_tokens: config.maxJetonsSortie,
            stream: true,
          },
          { signal },
        );

        let appels: Extract<ResponseInputItem, { type: "function_call" }>[] = [];
        for await (const evenement of flux) {
          if (evenement.type === "response.output_text.delta") {
            yield { type: "texte", delta: evenement.delta } satisfies EvenementIa;
          } else if (evenement.type === "response.completed") {
            const { usage, output } = evenement.response;
            if (usage) yield { type: "jetons", entree: usage.input_tokens, sortie: usage.output_tokens };
            appels = output.filter((item) => item.type === "function_call");
          }
        }

        if (appels.length === 0) return;

        for (const appel of appels) {
          yield { type: "outil", nom: appel.name };
          const outil = outils.find((o) => o.nom === appel.name);
          let resultat: unknown;
          try {
            if (!outil) throw new Error("outil inconnu");
            // Les arguments produits par le modèle sont une entrée externe : validés par l'outil.
            resultat = await outil.executer(JSON.parse(appel.arguments));
          } catch {
            resultat = { erreur: "Arguments invalides ou outil indisponible" };
          }
          entree.push(appel, {
            type: "function_call_output",
            call_id: appel.call_id,
            output: JSON.stringify(resultat),
          });
        }
      }
    },
  };
}
