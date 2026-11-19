import { type ClientDb, prisma } from "../db.ts";
import { NonTrouve } from "../erreurs.ts";
import type { FiltresReservations } from "../schemas/reservations.ts";
import type { PorteeReservations } from "../types/domaine.ts";

const inclure = {
  ouvrage: { select: { id: true, titre: true, auteur: true } },
  membre: { select: { id: true, email: true } },
} as const;

// Le champ technique « active » (contrainte d'unicité) n'est jamais renvoyé : le statut suffit.
const omettre = { active: true } as const;

export async function lister(
  { page, limite, statut, ouvrageId, membreId }: FiltresReservations,
  portee: PorteeReservations = {},
) {
  const where = {
    ...(statut !== undefined && { statut }),
    ...(ouvrageId !== undefined && { ouvrageId }),
    ...(membreId !== undefined && { membreId }),
    ...portee,
  };
  const [donnees, total] = await prisma.$transaction([
    prisma.reservation.findMany({
      where,
      include: inclure,
      omit: omettre,
      orderBy: { id: "asc" },
      skip: (page - 1) * limite,
      take: limite,
    }),
    prisma.reservation.count({ where }),
  ]);
  return { donnees, total };
}

export async function trouver(id: number, portee: PorteeReservations = {}, client: ClientDb = prisma) {
  const reservation = await client.reservation.findFirst({
    where: { id, ...portee },
    include: inclure,
    omit: omettre,
  });
  if (!reservation) throw new NonTrouve(`Réservation ${id} introuvable`);
  return reservation;
}

/** Une seconde réservation active du même membre sur le même ouvrage lève P2002. */
export function creer(donnees: { ouvrageId: number; membreId: number }, client: ClientDb) {
  return client.reservation.create({ data: donnees, include: inclure, omit: omettre });
}

/** File d'attente : la réservation active la plus ancienne de l'ouvrage. */
export function plusAncienneActive(ouvrageId: number, client: ClientDb) {
  return client.reservation.findFirst({
    where: { ouvrageId, statut: "active" },
    orderBy: [{ creeLe: "asc" }, { id: "asc" }],
  });
}

export function honorer(id: number, empruntId: number, client: ClientDb) {
  return client.reservation.update({
    where: { id },
    data: { statut: "honoree", active: null, empruntId },
  });
}

/** Annule une réservation active ; renvoie false si elle n'est plus active ou hors portée. */
export async function annulerSiActive(id: number, portee: PorteeReservations): Promise<boolean> {
  const { count } = await prisma.reservation.updateMany({
    where: { id, statut: "active", ...portee },
    data: { statut: "annulee", active: null },
  });
  return count === 1;
}

export function existe(id: number, portee: PorteeReservations) {
  return prisma.reservation.findFirst({ where: { id, ...portee }, select: { id: true } });
}
