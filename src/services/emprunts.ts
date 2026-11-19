import { prisma } from "../db.ts";
import { Conflit, NonTrouve, RequeteInvalide } from "../erreurs.ts";
import * as emprunts from "../repositories/emprunts.ts";
import * as ouvrages from "../repositories/ouvrages.ts";
import type { ModifierEmprunt } from "../schemas/emprunts.ts";
import type { PorteeEmprunts } from "../types/domaine.ts";

function verifierOrdreDates(dateEmprunt: Date, dateRetourPrevue: Date): void {
  if (dateRetourPrevue < dateEmprunt) {
    throw new RequeteInvalide("Validation échouée", [
      { champ: "dateRetourPrevue", message: "doit être postérieure ou égale à dateEmprunt" },
    ]);
  }
}

/**
 * Crée l'emprunt et rend l'ouvrage indisponible dans la même transaction.
 * La mise à jour conditionnelle empêche deux emprunts simultanés du même ouvrage :
 * le second ne modifie aucune ligne et reçoit 409, sans rien écrire.
 */
export async function creer({
  ouvrageId,
  emprunteurId,
  dateEmprunt = new Date(),
  dateRetourPrevue,
}: {
  ouvrageId: number;
  emprunteurId: number;
  dateEmprunt?: Date | undefined;
  dateRetourPrevue: Date;
}) {
  verifierOrdreDates(dateEmprunt, dateRetourPrevue);

  return prisma.$transaction(async (tx) => {
    const emprunteur = await tx.utilisateur.findUnique({ where: { id: emprunteurId }, select: { id: true } });
    if (!emprunteur) throw new NonTrouve(`Utilisateur ${emprunteurId} introuvable`);

    if (!(await ouvrages.prendreSiDisponible(ouvrageId, tx))) {
      if (!(await ouvrages.existe(ouvrageId, tx))) throw new NonTrouve(`Ouvrage ${ouvrageId} introuvable`);
      throw new Conflit(`Ouvrage ${ouvrageId} indisponible : il est déjà emprunté`);
    }
    return emprunts.creer({ ouvrageId, emprunteurId, dateEmprunt, dateRetourPrevue }, tx);
  });
}

/**
 * Lecture et mise à jour dans la même transaction : la ligne est verrouillée
 * (SELECT … FOR UPDATE) le temps de vérifier l'ordre des dates, pour qu'une modification
 * concurrente ne puisse pas s'intercaler entre la lecture et l'écriture.
 */
export async function modifier(id: number, donnees: ModifierEmprunt, portee: PorteeEmprunts) {
  return prisma.$transaction(async (tx) => {
    await emprunts.verrouiller(id, tx);
    const actuel = await emprunts.trouver(id, portee, tx);
    verifierOrdreDates(
      donnees.dateEmprunt ?? actuel.dateEmprunt,
      donnees.dateRetourPrevue ?? actuel.dateRetourPrevue,
    );
    return emprunts.modifier(id, donnees, tx);
  });
}

/**
 * Marque l'emprunt rendu et l'ouvrage de nouveau disponible, dans la même transaction.
 */
export async function retourner(id: number, portee: PorteeEmprunts) {
  return prisma.$transaction(async (tx) => {
    if (!(await emprunts.marquerRenduSiEnCours(id, portee, tx))) {
      if (!(await emprunts.existe(id, portee, tx))) throw new NonTrouve(`Emprunt ${id} introuvable`);
      throw new Conflit(`Emprunt ${id} déjà rendu`);
    }
    const rendu = await emprunts.trouver(id, {}, tx);
    await ouvrages.definirDisponibilite(rendu.ouvrageId, true, tx);
    return rendu;
  });
}

/** Supprimer un emprunt en cours libère l'ouvrage. */
export async function supprimer(id: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const emprunt = await emprunts.supprimer(id, tx);
    if (!emprunt.rendu) await ouvrages.definirDisponibilite(emprunt.ouvrageId, true, tx);
  });
}
