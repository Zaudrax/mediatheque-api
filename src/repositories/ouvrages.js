import { prisma } from "../db.js";
import { Conflit, NonTrouve } from "../erreurs.js";

export async function lister({ page, limite, disponible }) {
  const where = disponible === undefined ? {} : { disponible };
  const [donnees, total] = await prisma.$transaction([
    prisma.ouvrage.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * limite,
      take: limite,
    }),
    prisma.ouvrage.count({ where }),
  ]);
  return { donnees, total };
}

/** Un ouvrage avec ses emprunts en cours (non rendus). */
export async function trouver(id) {
  const ouvrage = await prisma.ouvrage.findUnique({
    where: { id },
    include: {
      emprunts: { where: { rendu: false }, orderBy: { dateEmprunt: "asc" } },
    },
  });
  if (!ouvrage) throw new NonTrouve(`Ouvrage ${id} introuvable`);
  return ouvrage;
}

export function creer(donnees) {
  return prisma.ouvrage.create({ data: donnees });
}

/** Un identifiant inconnu lève P2025, traduit en 404 par le gestionnaire d'erreurs. */
export function modifier(id, donnees) {
  return prisma.ouvrage.update({ where: { id }, data: donnees });
}

export async function supprimer(id) {
  await prisma.$transaction(async (tx) => {
    const ouvrage = await tx.ouvrage.findUnique({
      where: { id },
      select: { _count: { select: { emprunts: { where: { rendu: false } } } } },
    });
    if (!ouvrage) throw new NonTrouve(`Ouvrage ${id} introuvable`);
    if (ouvrage._count.emprunts > 0) {
      throw new Conflit(`Ouvrage ${id} actuellement emprunté : suppression impossible`);
    }
    // S'il reste un historique d'emprunts rendus, la clé étrangère (onDelete: Restrict)
    // lève P2003, traduit en 409 par le gestionnaire d'erreurs.
    await tx.ouvrage.delete({ where: { id } });
  });
}
