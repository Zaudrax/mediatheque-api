import { z } from "zod";
import { booleenQuery, dateReponse, pagination } from "./commun.ts";

const titre = z.string().trim().min(1).max(150).meta({ example: "Germinal" });
const auteur = z.string().trim().min(1).max(120).meta({ example: "Émile Zola" });
const annee = z
  .number({ error: "doit être un nombre entier" })
  .int("doit être un entier")
  .min(1450, "doit être supérieure ou égale à 1450")
  // Évalué à chaque requête : la borne suit l'année courante.
  .refine((valeur) => valeur <= new Date().getFullYear(), {
    error: () => `doit être inférieure ou égale à ${new Date().getFullYear()}`,
  })
  .meta({ description: "Année de parution, de 1450 à l'année courante", example: 1885 });

// « disponible » n'est pas modifiable directement : il est piloté par les emprunts.
// Les champs inconnus (dont « disponible ») sont ignorés par z.object.
export const creerOuvrage = z.object({ titre, auteur, annee }).meta({ id: "CreerOuvrage" });

export const modifierOuvrage = z
  .object({ titre: titre.optional(), auteur: auteur.optional(), annee: annee.optional() })
  .refine((corps) => Object.values(corps).some((v) => v !== undefined), {
    error: "au moins un champ parmi titre, auteur, annee est requis",
  })
  .meta({ id: "ModifierOuvrage" });

export const listerOuvrages = z.object({
  ...pagination,
  disponible: booleenQuery.optional().meta({ description: "Filtre sur la disponibilité" }),
});

export type CreerOuvrage = z.output<typeof creerOuvrage>;
export type ModifierOuvrage = z.output<typeof modifierOuvrage>;
export type FiltresOuvrages = z.output<typeof listerOuvrages>;

// Réponses
export const Ouvrage = z
  .object({
    id: z.number().int(),
    titre: z.string(),
    auteur: z.string(),
    annee: z.number().int(),
    disponible: z.boolean(),
    creeLe: dateReponse,
    modifieLe: dateReponse,
  })
  .meta({ id: "Ouvrage" });
