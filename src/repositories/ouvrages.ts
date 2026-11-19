import { type ClientDb, prisma } from "../db.ts";
import { NonTrouve } from "../erreurs.ts";
import type { CreerOuvrage, FiltresOuvrages, ModifierOuvrage } from "../schemas/ouvrages.ts";
import type { PorteeEmprunts } from "../types/domaine.ts";

/** Seuls les ouvrages non archivés font partie du catalogue. */
export const auCatalogue = { archiveLe: null };

// archiveLe vaut toujours null pour un ouvrage du catalogue : inutile de le renvoyer.
const omettre = { archiveLe: true } as const;

export async function lister({ page, limite, disponible }: FiltresOuvrages) {
  const where = { ...auCatalogue, ...(disponible !== undefined && { disponible }) };
  const [donnees, total] = await prisma.$transaction([
    prisma.ouvrage.findMany({
      where,
      omit: omettre,
      orderBy: { id: "asc" },
      skip: (page - 1) * limite,
      take: limite,
    }),
    prisma.ouvrage.count({ where }),
  ]);
  return { donnees, total };
}

/**
 * Un ouvrage avec ses emprunts en cours (non rendus).
 * portee restreint les emprunts visibles : un membre ne voit que les siens.
 */
export async function trouver(id: number, portee: PorteeEmprunts = {}) {
  const ouvrage = await prisma.ouvrage.findFirst({
    where: { id, ...auCatalogue },
    omit: omettre,
    include: { emprunts: { where: { rendu: false, ...portee }, orderBy: { dateEmprunt: "asc" } } },
  });
  if (!ouvrage) throw new NonTrouve(`Ouvrage ${id} introuvable`);
  return ouvrage;
}

/** Recherche dans le catalogue par titre ou auteur, insensible à la casse (outil de l'assistant). */
export function rechercher({ requete, disponible }: { requete: string; disponible?: boolean | undefined }) {
  return prisma.ouvrage.findMany({
    where: {
      OR: [
        { titre: { contains: requete, mode: "insensitive" } },
        { auteur: { contains: requete, mode: "insensitive" } },
      ],
      ...auCatalogue,
      ...(disponible !== undefined && { disponible }),
    },
    select: { id: true, titre: true, auteur: true, annee: true, disponible: true },
    orderBy: { titre: "asc" },
    take: 10,
  });
}

export function creer(donnees: CreerOuvrage) {
  return prisma.ouvrage.create({ data: donnees, omit: omettre });
}

/** Un identifiant inconnu ou archivé lève P2025, traduit en 404 par le gestionnaire d'erreurs. */
export function modifier(id: number, donnees: ModifierOuvrage) {
  return prisma.ouvrage.update({ where: { id, ...auCatalogue }, data: donnees, omit: omettre });
}

/**
 * Verrouille la ligne de l'ouvrage jusqu'à la fin de la transaction et la renvoie
 * (null s'il est inconnu ou archivé).
 */
export async function verrouiller(id: number, client: ClientDb) {
  await client.$queryRaw`SELECT id FROM ouvrages WHERE id = ${id} FOR UPDATE`;
  return client.ouvrage.findFirst({ where: { id, ...auCatalogue }, select: { id: true, disponible: true } });
}

/**
 * Passe l'ouvrage à indisponible s'il était disponible. Renvoie false sinon :
 * la condition dans le WHERE empêche deux emprunts simultanés du même ouvrage.
 */
export async function prendreSiDisponible(id: number, client: ClientDb): Promise<boolean> {
  const { count } = await client.ouvrage.updateMany({
    where: { id, disponible: true, ...auCatalogue },
    data: { disponible: false },
  });
  return count === 1;
}

export function definirDisponibilite(id: number, disponible: boolean, client: ClientDb) {
  return client.ouvrage.update({ where: { id }, data: { disponible } });
}

/** L'ouvrage est-il au catalogue (connu et non archivé) ? */
export function existe(id: number, client: ClientDb = prisma) {
  return client.ouvrage.findFirst({ where: { id, ...auCatalogue }, select: { id: true } });
}

export function compterEmpruntsEnCours(id: number, client: ClientDb) {
  return client.emprunt.count({ where: { ouvrageId: id, rendu: false } });
}

/** Nombre d'emprunts et de réservations, passés ou en cours, qui référencent l'ouvrage. */
export async function compterHistorique(id: number, client: ClientDb): Promise<number> {
  const [nbEmprunts, nbReservations] = await Promise.all([
    client.emprunt.count({ where: { ouvrageId: id } }),
    client.reservation.count({ where: { ouvrageId: id } }),
  ]);
  return nbEmprunts + nbReservations;
}

/** Suppression définitive : réservée à un ouvrage sans aucun historique. */
export function supprimer(id: number, client: ClientDb) {
  return client.ouvrage.delete({ where: { id } });
}

/** Archivage logique : l'ouvrage quitte le catalogue, ses emprunts et réservations restent. */
export function archiver(id: number, client: ClientDb) {
  return client.ouvrage.update({ where: { id }, data: { archiveLe: new Date() } });
}
