import { prisma } from "../db.js";
import { Conflit, NonTrouve, RequeteInvalide } from "../erreurs.js";

const inclure = {
  ouvrage: { select: { id: true, titre: true, auteur: true } },
  emprunteur: { select: { id: true, email: true } },
};

/**
 * La « portée » limite les emprunts accessibles : {} pour un bibliothécaire,
 * { emprunteurId } pour un membre. Un emprunt hors portée est traité comme inexistant (404),
 * pour ne pas révéler son existence.
 */

function verifierOrdreDates(dateEmprunt, dateRetourPrevue) {
  if (dateRetourPrevue < dateEmprunt) {
    throw new RequeteInvalide("Validation échouée", [
      { champ: "dateRetourPrevue", message: "doit être postérieure ou égale à dateEmprunt" },
    ]);
  }
}

export async function lister({ page, limite, rendu, ouvrageId, emprunteurId }, portee = {}) {
  const where = {};
  if (rendu !== undefined) where.rendu = rendu;
  if (ouvrageId !== undefined) where.ouvrageId = ouvrageId;
  if (emprunteurId !== undefined) where.emprunteurId = emprunteurId;
  Object.assign(where, portee); // la portée l'emporte sur les filtres du client

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

export async function trouver(id, portee = {}) {
  const emprunt = await prisma.emprunt.findFirst({ where: { id, ...portee }, include: inclure });
  if (!emprunt) throw new NonTrouve(`Emprunt ${id} introuvable`);
  return emprunt;
}

/**
 * Crée l'emprunt et rend l'ouvrage indisponible dans la même transaction.
 * La mise à jour conditionnelle (disponible: true) empêche deux emprunts simultanés
 * du même ouvrage : le second ne modifie aucune ligne et reçoit 409, sans rien écrire.
 */
export async function creer({ ouvrageId, emprunteurId, dateEmprunt = new Date(), dateRetourPrevue }) {
  verifierOrdreDates(dateEmprunt, dateRetourPrevue);

  return prisma.$transaction(async (tx) => {
    const emprunteur = await tx.utilisateur.findUnique({ where: { id: emprunteurId }, select: { id: true } });
    if (!emprunteur) throw new NonTrouve(`Utilisateur ${emprunteurId} introuvable`);

    const { count } = await tx.ouvrage.updateMany({
      where: { id: ouvrageId, disponible: true },
      data: { disponible: false },
    });
    if (count === 0) {
      const existe = await tx.ouvrage.findUnique({ where: { id: ouvrageId }, select: { id: true } });
      if (!existe) throw new NonTrouve(`Ouvrage ${ouvrageId} introuvable`);
      throw new Conflit(`Ouvrage ${ouvrageId} indisponible : il est déjà emprunté`);
    }
    return tx.emprunt.create({
      data: { ouvrageId, emprunteurId, dateEmprunt, dateRetourPrevue },
      include: inclure,
    });
  });
}

/**
 * Lecture et mise à jour dans la même transaction : la ligne est verrouillée
 * (SELECT … FOR UPDATE) le temps de vérifier l'ordre des dates, pour qu'une modification
 * concurrente ne puisse pas s'intercaler entre la lecture et l'écriture.
 */
export async function modifier(id, donnees, portee = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM emprunts WHERE id = ${id} FOR UPDATE`;
    const actuel = await tx.emprunt.findFirst({ where: { id, ...portee } });
    if (!actuel) throw new NonTrouve(`Emprunt ${id} introuvable`);
    verifierOrdreDates(
      donnees.dateEmprunt ?? actuel.dateEmprunt,
      donnees.dateRetourPrevue ?? actuel.dateRetourPrevue,
    );
    return tx.emprunt.update({ where: { id }, data: donnees, include: inclure });
  });
}

/** Marque l'emprunt rendu et l'ouvrage de nouveau disponible, atomiquement. */
export async function retourner(id, portee = {}) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.emprunt.updateMany({
      where: { id, rendu: false, ...portee },
      data: { rendu: true, renduLe: new Date() },
    });
    if (count === 0) {
      const existe = await tx.emprunt.findFirst({ where: { id, ...portee }, select: { id: true } });
      if (!existe) throw new NonTrouve(`Emprunt ${id} introuvable`);
      throw new Conflit(`Emprunt ${id} déjà rendu`);
    }
    const emprunt = await tx.emprunt.findUniqueOrThrow({ where: { id } });
    await tx.ouvrage.update({ where: { id: emprunt.ouvrageId }, data: { disponible: true } });
    return tx.emprunt.findUniqueOrThrow({ where: { id }, include: inclure });
  });
}

/** Supprimer un emprunt en cours libère l'ouvrage. Identifiant inconnu : P2025 → 404. */
export async function supprimer(id) {
  await prisma.$transaction(async (tx) => {
    const emprunt = await tx.emprunt.delete({ where: { id } });
    if (!emprunt.rendu) {
      await tx.ouvrage.update({ where: { id: emprunt.ouvrageId }, data: { disponible: true } });
    }
  });
}
