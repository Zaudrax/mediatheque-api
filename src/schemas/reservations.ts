import { z } from "zod";
import { dateReponse, identifiant, pagination } from "./commun.ts";

export const statutsReservation = ["active", "honoree", "annulee"] as const;

/** Un membre réserve pour lui-même ; un bibliothécaire peut réserver au nom d'un membre. */
export const creerReservation = z
  .object({
    ouvrageId: identifiant,
    membreId: identifiant
      .optional()
      .meta({ description: "Bibliothécaire uniquement : membre pour qui la réservation est créée" }),
  })
  .meta({ id: "CreerReservation" });

export const listerReservations = z.object({
  ...pagination,
  statut: z.enum(statutsReservation).optional().meta({ description: "Filtre sur le statut" }),
  ouvrageId: identifiant.optional(),
  membreId: identifiant.optional().meta({ description: "Bibliothécaire uniquement" }),
});

export type CreerReservation = z.output<typeof creerReservation>;
export type FiltresReservations = z.output<typeof listerReservations>;

// Réponses
export const Reservation = z
  .object({
    id: z.number().int(),
    ouvrageId: z.number().int(),
    membreId: z.number().int(),
    statut: z.enum(statutsReservation),
    creeLe: dateReponse,
    modifieLe: dateReponse,
    empruntId: z.number().int().nullable().meta({ description: "Emprunt créé au retour de l'ouvrage" }),
    ouvrage: z.object({ id: z.number().int(), titre: z.string(), auteur: z.string() }),
    membre: z.object({ id: z.number().int(), email: z.string() }),
  })
  .meta({ id: "Reservation" });
