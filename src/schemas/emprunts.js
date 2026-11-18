import { z } from "zod";
import { booleenQuery, dateIso, identifiant, pagination } from "./commun.js";

const retourApresEmprunt = (corps) =>
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
    emprunteurId: identifiant.optional(),
    // Par défaut, l'emprunt commence maintenant.
    dateEmprunt: dateIso.optional(),
    dateRetourPrevue: dateIso,
  })
  .refine(retourApresEmprunt, erreurOrdreDates);

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
  .refine(retourApresEmprunt, erreurOrdreDates);

export const listerEmprunts = z.object({
  ...pagination,
  rendu: booleenQuery.optional(),
  ouvrageId: identifiant.optional(),
  // Filtre réservé aux bibliothécaires ; un membre est toujours limité à ses emprunts.
  emprunteurId: identifiant.optional(),
});
