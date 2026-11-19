import { z } from "zod";
import * as emprunts from "../../repositories/emprunts.ts";
import * as ouvrages from "../../repositories/ouvrages.ts";
import * as reservations from "../../repositories/reservations.ts";
import { argumentsMesEmprunts, argumentsRecherche } from "../../schemas/assistant.ts";
import type { UtilisateurConnecte } from "../../types/domaine.ts";
import type { Outil } from "./types.ts";

const enJsonSchema = (schema: z.ZodType) => {
  const { $schema: _ignore, ...reste } = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  return reste;
};

/**
 * Outils de l'assistant pour l'utilisateur connecté. L'identité vient de l'access token,
 * capturée par fermeture : aucun outil n'accepte d'identifiant d'utilisateur en argument,
 * et chaque outil applique la même portée que les routes de l'API.
 */
export function creerOutils(utilisateur: UtilisateurConnecte): Outil[] {
  return [
    {
      nom: "rechercher_ouvrages",
      description:
        "Recherche des ouvrages du catalogue par mots du titre ou nom d'auteur et indique leur disponibilité.",
      parametres: enJsonSchema(argumentsRecherche),
      async executer(args) {
        const { requete, disponible } = argumentsRecherche.parse(args);
        return ouvrages.rechercher({ requete, disponible });
      },
    },
    {
      nom: "mes_emprunts",
      description:
        "Liste les emprunts de l'utilisateur connecté (titre, dates, rendu ou non). enCours=true pour les seuls emprunts en cours.",
      parametres: enJsonSchema(argumentsMesEmprunts),
      async executer(args) {
        const { enCours } = argumentsMesEmprunts.parse(args);
        // Portée toujours limitée à l'utilisateur lui-même, même pour un bibliothécaire.
        const { donnees } = await emprunts.lister(
          { page: 1, limite: 20, rendu: enCours === undefined ? undefined : !enCours },
          { emprunteurId: utilisateur.id },
        );
        return donnees.map((e) => ({
          id: e.id,
          ouvrage: e.ouvrage.titre,
          auteur: e.ouvrage.auteur,
          dateEmprunt: e.dateEmprunt,
          dateRetourPrevue: e.dateRetourPrevue,
          rendu: e.rendu,
        }));
      },
    },
    {
      nom: "mes_reservations",
      description: "Liste les réservations actives de l'utilisateur connecté.",
      parametres: { type: "object", properties: {}, additionalProperties: false },
      async executer() {
        const { donnees } = await reservations.lister(
          { page: 1, limite: 20, statut: "active" },
          { membreId: utilisateur.id },
        );
        return donnees.map((r) => ({
          id: r.id,
          ouvrage: r.ouvrage.titre,
          auteur: r.ouvrage.auteur,
          reserveLe: r.creeLe,
        }));
      },
    },
  ];
}
