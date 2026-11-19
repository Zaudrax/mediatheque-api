import { z } from "zod";
import { booleenQuery, dateIso, dateReponse, identifiant, pagination } from "./commun.ts";

type Dates = { dateEmprunt?: Date | undefined; dateRetourPrevue?: Date | undefined };

const retourApresEmprunt = (corps: Dates) =>
  !corps.dateEmprunt || !corps.dateRetourPrevue || corps.dateRetourPrevue >= corps.dateEmprunt;
const erreurOrdreDates = {
  error: "doit être postérieure ou égale à dateEmprunt",
  path: ["dateRetourPrevue"],
};

/**
 * emprunteurId n'est pris en compte que pour un bibliothécaire (emprunt au nom d'un membre).
 * Pour un membre, la route impose son propre identifiant : il emprunte toujours pour lui-même.
 */
export const creerEmprunt = z
  .object({
    ouvrageId: identifiant,
    emprunteurId: identifiant
      .optional()
      .meta({ description: "Bibliothécaire uniquement : membre pour qui l'emprunt est créé" }),
    dateEmprunt: dateIso.optional().meta({ description: "Par défaut : maintenant" }),
    dateRetourPrevue: dateIso,
  })
  .refine(retourApresEmprunt, erreurOrdreDates)
  .meta({ id: "CreerEmprunt" });

// Ni l'ouvrage, ni le propriétaire (emprunteurId), ni le statut « rendu » ne se modifient par PATCH :
// ces champs sont absents du schéma, donc ignorés s'ils sont envoyés.
export const modifierEmprunt = z
  .object({
    dateEmprunt: dateIso.optional(),
    dateRetourPrevue: dateIso.optional(),
  })
  .refine((corps) => Object.values(corps).some((v) => v !== undefined), {
    error: "au moins un champ parmi dateEmprunt, dateRetourPrevue est requis",
  })
  .refine(retourApresEmprunt, erreurOrdreDates)
  .meta({ id: "ModifierEmprunt" });

export const listerEmprunts = z.object({
  ...pagination,
  rendu: booleenQuery.optional().meta({ description: "Filtre sur le statut rendu" }),
  ouvrageId: identifiant.optional(),
  // Filtre réservé aux bibliothécaires ; un membre est toujours limité à ses emprunts.
  emprunteurId: identifiant.optional().meta({ description: "Bibliothécaire uniquement" }),
});

export type CreerEmprunt = z.output<typeof creerEmprunt>;
export type ModifierEmprunt = z.output<typeof modifierEmprunt>;
export type FiltresEmprunts = z.output<typeof listerEmprunts>;

// Réponses
export const Emprunt = z
  .object({
    id: z.number().int(),
    ouvrageId: z.number().int(),
    emprunteurId: z.number().int(),
    dateEmprunt: dateReponse,
    dateRetourPrevue: dateReponse,
    rendu: z.boolean(),
    renduLe: dateReponse.nullable(),
    creeLe: dateReponse,
    modifieLe: dateReponse,
    ouvrage: z.object({ id: z.number().int(), titre: z.string(), auteur: z.string() }),
    emprunteur: z.object({ id: z.number().int(), email: z.string() }),
  })
  .meta({ id: "Emprunt" });
