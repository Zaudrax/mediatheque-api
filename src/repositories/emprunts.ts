import { type ClientDb, prisma } from "../db.ts";
import { NonTrouve } from "../erreurs.ts";
import type { FiltresEmprunts, ModifierEmprunt } from "../schemas/emprunts.ts";
import type { PorteeEmprunts } from "../types/domaine.ts";

/**
 * La « portée » limite les emprunts accessibles : {} pour un bibliothécaire,
 * { emprunteurId } pour un membre. Un emprunt hors portée est traité comme inexistant (404),
 * pour ne pas révéler son existence.
 */

const inclure = {
  ouvrage: { select: { id: true, titre: true, auteur: true } },
  emprunteur: { select: { id: true, email: true } },
} as const;

export async function lister(
  { page, limite, rendu, ouvrageId, emprunteurId }: FiltresEmprunts,
  portee: PorteeEmprunts = {},
) {
  const where = {
    ...(rendu !== undefined && { rendu }),
    ...(ouvrageId !== undefined && { ouvrageId }),
    ...(emprunteurId !== undefined && { emprunteurId }),
    ...portee, // la portée l'emporte sur les filtres du client
  };
  const [donnees, total] = await prisma.$transaction([
    prisma.emprunt.findMany({
      where,
      include: inclure,
      orderBy: { id: "asc" },
      skip: (page - 1) * limite,
      take: limite,
    }),
    prisma.emprunt.count({ where }),
  ]);
  return { donnees, total };
}

export async function trouver(id: number, portee: PorteeEmprunts = {}, client: ClientDb = prisma) {
  const emprunt = await client.emprunt.findFirst({ where: { id, ...portee }, include: inclure });
  if (!emprunt) throw new NonTrouve(`Emprunt ${id} introuvable`);
  return emprunt;
}

export function creer(
  donnees: { ouvrageId: number; emprunteurId: number; dateEmprunt: Date; dateRetourPrevue: Date },
  client: ClientDb,
) {
  return client.emprunt.create({ data: donnees, include: inclure });
}

export function modifier(id: number, donnees: ModifierEmprunt, client: ClientDb) {
  return client.emprunt.update({ where: { id }, data: donnees, include: inclure });
}

/** Verrouille la ligne de l'emprunt jusqu'à la fin de la transaction. */
export async function verrouiller(id: number, client: ClientDb): Promise<void> {
  await client.$queryRaw`SELECT id FROM emprunts WHERE id = ${id} FOR UPDATE`;
}

/** Marque rendu un emprunt en cours ; renvoie false s'il est déjà rendu ou hors portée. */
export async function marquerRenduSiEnCours(
  id: number,
  portee: PorteeEmprunts,
  client: ClientDb,
): Promise<boolean> {
  const { count } = await client.emprunt.updateMany({
    where: { id, rendu: false, ...portee },
    data: { rendu: true, renduLe: new Date() },
  });
  return count === 1;
}

export function existe(id: number, portee: PorteeEmprunts, client: ClientDb) {
  return client.emprunt.findFirst({ where: { id, ...portee }, select: { id: true } });
}

export function membreEmprunteDeja(ouvrageId: number, emprunteurId: number, client: ClientDb) {
  return client.emprunt.findFirst({ where: { ouvrageId, emprunteurId, rendu: false }, select: { id: true } });
}

/** Identifiant inconnu : P2025 → 404. */
export function supprimer(id: number, client: ClientDb) {
  return client.emprunt.delete({ where: { id } });
}
