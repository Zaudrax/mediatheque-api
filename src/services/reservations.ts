import { prisma } from "../db.ts";
import { Conflit, NonTrouve } from "../erreurs.ts";
import { Prisma } from "../generated/prisma/client.ts";
import * as emprunts from "../repositories/emprunts.ts";
import * as ouvrages from "../repositories/ouvrages.ts";
import * as reservations from "../repositories/reservations.ts";
import type { PorteeReservations } from "../types/domaine.ts";

/**
 * Réserve un ouvrage indisponible pour un membre.
 * - ouvrage inconnu : 404 ; ouvrage disponible : 409 (il suffit de l'emprunter) ;
 * - le membre l'emprunte déjà : 409 ; il a déjà une réservation active dessus : 409 (unicité).
 * La ligne de l'ouvrage est verrouillée pour qu'un retour simultané ne laisse pas
 * une réservation active sur un ouvrage redevenu disponible.
 */
export async function creer({ ouvrageId, membreId }: { ouvrageId: number; membreId: number }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const membre = await tx.utilisateur.findUnique({ where: { id: membreId }, select: { id: true } });
      if (!membre) throw new NonTrouve(`Utilisateur ${membreId} introuvable`);

      const ouvrage = await ouvrages.verrouiller(ouvrageId, tx);
      if (!ouvrage) throw new NonTrouve(`Ouvrage ${ouvrageId} introuvable`);
      if (ouvrage.disponible) {
        throw new Conflit(`Ouvrage ${ouvrageId} disponible : empruntez-le directement`);
      }
      if (await emprunts.membreEmprunteDeja(ouvrageId, membreId, tx)) {
        throw new Conflit(`Ouvrage ${ouvrageId} déjà emprunté par ce membre`);
      }
      return reservations.creer({ ouvrageId, membreId }, tx);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Conflit(`Une réservation active existe déjà sur l'ouvrage ${ouvrageId} pour ce membre`);
    }
    throw err;
  }
}

/** Annule une réservation active. Déjà honorée ou annulée : 409 ; inconnue ou d'un autre membre : 404. */
export async function annuler(id: number, portee: PorteeReservations): Promise<void> {
  if (await reservations.annulerSiActive(id, portee)) return;
  if (!(await reservations.existe(id, portee))) throw new NonTrouve(`Réservation ${id} introuvable`);
  throw new Conflit(`Réservation ${id} déjà honorée ou annulée`);
}
