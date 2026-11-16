import { z } from "zod";
import { booleenQuery, pagination } from "./commun.js";

const titre = z.string().trim().min(1).max(150);
const auteur = z.string().trim().min(1).max(120);
const annee = z
  .number({ error: "doit être un nombre entier" })
  .int("doit être un entier")
  .min(1450, "doit être supérieure ou égale à 1450")
  // Évalué à chaque requête : la borne suit l'année courante.
  .refine((valeur) => valeur <= new Date().getFullYear(), {
    error: () => `doit être inférieure ou égale à ${new Date().getFullYear()}`,
  });

// « disponible » n'est pas modifiable directement : il est piloté par les emprunts.
// Les champs inconnus (dont « disponible ») sont ignorés par z.object.
export const creerOuvrage = z.object({ titre, auteur, annee });

export const modifierOuvrage = z
  .object({ titre: titre.optional(), auteur: auteur.optional(), annee: annee.optional() })
  .refine((corps) => Object.values(corps).some((v) => v !== undefined), {
    error: "au moins un champ parmi titre, auteur, annee est requis",
  });

export const listerOuvrages = z.object({
  ...pagination,
  disponible: booleenQuery.optional(),
});
