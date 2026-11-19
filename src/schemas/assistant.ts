import { z } from "zod";

export const question = z
  .object({
    question: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .meta({ example: "Avez-vous un roman de Zola disponible ?" }),
  })
  .meta({ id: "QuestionAssistant" });

export type Question = z.output<typeof question>;

/** Arguments que le modèle peut fournir aux outils : validés comme toute entrée externe. */
export const argumentsRecherche = z.object({
  requete: z.string().trim().min(1).max(100),
  disponible: z.boolean().optional(),
});

export const argumentsMesEmprunts = z.object({
  enCours: z.boolean().optional(),
});
