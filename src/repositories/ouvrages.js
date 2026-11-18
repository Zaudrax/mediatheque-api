import { prisma } from "../db.js";
import { Conflit, NonTrouve } from "../erreurs.js";

/** Seuls les ouvrages non archivés font partie du catalogue. */
export const auCatalogue = { archiveLe: null };

// archiveLe vaut toujours null pour un ouvrage du catalogue : inutile de le renvoyer.
const omettre = { archiveLe: true };

export async function lister({ page, limite, disponible }) {
  const where = disponible === undefined ? { ...auCatalogue } : { ...auCatalogue, disponible };
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
export async function trouver(id, portee = {}) {
  const ouvrage = await prisma.ouvrage.findFirst({
    where: { id, ...auCatalogue },
    omit: omettre,
    include: {
      emprunts: { where: { rendu: false, ...portee }, orderBy: { dateEmprunt: "asc" } },
    },
  });
  if (!ouvrage) throw new NonTrouve(`Ouvrage ${id} introuvable`);
  return ouvrage;
}

export function creer(donnees) {
  return prisma.ouvrage.create({ data: donnees, omit: omettre });
}

/** Un identifiant inconnu ou archivé lève P2025, traduit en 404 par le gestionnaire d'erreurs. */
export function modifier(id, donnees) {
  return prisma.ouvrage.update({ where: { id, ...auCatalogue }, data: donnees, omit: omettre });
}

/**
 * Retire un ouvrage du catalogue.
 * - emprunté : 409 ;
 * - sans aucun emprunt : supprimé définitivement ;
 * - avec un historique d'emprunts rendus : archivé (archiveLe renseigné) pour conserver
 *   l'historique ; il n'apparaît plus dans le catalogue et ne peut plus être emprunté.
 * Renvoie « supprime » ou « archive ».
 */
export async function supprimer(id) {
  return prisma.$transaction(async (tx) => {
    const ouvrage = await tx.ouvrage.findFirst({ where: { id, ...auCatalogue }, select: { id: true } });
    if (!ouvrage) throw new NonTrouve(`Ouvrage ${id} introuvable`);

    const [enCours, total] = await Promise.all([
      tx.emprunt.count({ where: { ouvrageId: id, rendu: false } }),
      tx.emprunt.count({ where: { ouvrageId: id } }),
    ]);
    if (enCours > 0) {
      throw new Conflit(`Ouvrage ${id} actuellement emprunté : suppression impossible`);
    }
    if (total === 0) {
      await tx.ouvrage.delete({ where: { id } });
      return "supprime";
    }
    await tx.ouvrage.update({ where: { id }, data: { archiveLe: new Date() } });
    return "archive";
  });
}
