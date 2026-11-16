import { z } from "zod";
import { booleenQuery, dateIso, identifiant, pagination } from "./commun.js";

const emprunteur = z.string().trim().min(2).max(80);

const retourApresEmprunt = (corps) =>
  !corps.dateEmprunt || !corps.dateRetourPrevue || corps.dateRetourPrevue >= corps.dateEmprunt;
const erreurOrdreDates = {
  error: "doit être postérieure ou égale à dateEmprunt",
  path: ["dateRetourPrevue"],
};

export const creerEmprunt = z
  .object({
    ouvrageId: identifiant,
    emprunteur,
    // Par défaut, l'emprunt commence maintenant.
    dateEmprunt: dateIso.optional(),
    dateRetourPrevue: dateIso,
  })
  .refine(retourApresEmprunt, erreurOrdreDates);

// L'ouvrage et le statut « rendu » ne se modifient pas par PATCH
// (le retour passe par POST /api/emprunts/:id/retour).
export const modifierEmprunt = z
  .object({
    emprunteur: emprunteur.optional(),
    dateEmprunt: dateIso.optional(),
    dateRetourPrevue: dateIso.optional(),
  })
  .refine((corps) => Object.values(corps).some((v) => v !== undefined), {
    error: "au moins un champ parmi emprunteur, dateEmprunt, dateRetourPrevue est requis",
  })
  .refine(retourApresEmprunt, erreurOrdreDates);

export const listerEmprunts = z.object({
  ...pagination,
  rendu: booleenQuery.optional(),
  ouvrageId: identifiant.optional(),
});
