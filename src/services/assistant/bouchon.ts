import type { EvenementIa, FournisseurIa, Outil, RequeteIa } from "./types.ts";

const MOTS_VIDES = new Set([
  "avez", "vous", "avez-vous", "livre", "livres", "roman", "romans", "ouvrage", "ouvrages",
  "disponible", "disponibles", "quels", "quel", "quelle", "est-ce", "dans", "pour", "avec",
  "catalogue", "cherche", "auriez", "bonjour", "merci",
]);

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const minuterie = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(minuterie); reject(signal.reason); }, { once: true });
  });

async function appeler(outils: Outil[], nom: string, args: unknown) {
  const outil = outils.find((o) => o.nom === nom);
  return outil ? ((await outil.executer(args)) as Record<string, unknown>[]) : [];
}

/**
 * Fournisseur bouchon : aucune clé, aucun réseau, aucun coût. Il choisit un outil par mots-clés,
 * l'exécute réellement (avec les droits de l'utilisateur) et diffuse une réponse mot à mot.
 * Utilisé par les tests et en développement sans clé.
 */
export function creerFournisseurBouchon({ delaiMs = 15 } = {}): FournisseurIa {
  return {
    nom: "bouchon",
    async *repondreEnFlux({ question, outils, signal }: RequeteIa): AsyncGenerator<EvenementIa> {
      let texte: string;

      if (/emprunt/i.test(question)) {
        yield { type: "outil", nom: "mes_emprunts" };
        const lignes = await appeler(outils, "mes_emprunts", { enCours: true });
        texte = lignes.length
          ? `Vous avez ${lignes.length} emprunt(s) en cours : ${lignes.map((l) => `« ${l.ouvrage} »`).join(", ")}.`
          : "Vous n'avez aucun emprunt en cours.";
      } else if (/r[ée]serv/i.test(question)) {
        yield { type: "outil", nom: "mes_reservations" };
        const lignes = await appeler(outils, "mes_reservations", {});
        texte = lignes.length
          ? `Vous avez ${lignes.length} réservation(s) active(s) : ${lignes.map((l) => `« ${l.ouvrage} »`).join(", ")}.`
          : "Vous n'avez aucune réservation active.";
      } else {
        const mots = question
          .toLowerCase()
          .split(/[^\p{L}\p{N}-]+/u)
          .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));
        yield { type: "outil", nom: "rechercher_ouvrages" };
        let trouves: Record<string, unknown>[] = [];
        for (const mot of mots) {
          trouves = await appeler(outils, "rechercher_ouvrages", { requete: mot });
          if (trouves.length) break;
        }
        texte = trouves.length
          ? `J'ai trouvé : ${trouves
              .map((o) => `« ${o.titre} » de ${o.auteur} (${o.disponible ? "disponible" : "emprunté"})`)
              .join(", ")}.`
          : "Je n'ai trouvé aucun ouvrage correspondant dans le catalogue.";
      }

      texte = `[bouchon] ${texte}`;
      const morceaux = texte.split(/(?<= )/);
      for (const delta of morceaux) {
        await pause(delaiMs, signal);
        yield { type: "texte", delta };
      }
      yield { type: "jetons", entree: question.split(/\s+/).length, sortie: morceaux.length };
    },
  };
}
