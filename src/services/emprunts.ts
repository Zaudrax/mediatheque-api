import { type ClientDb, prisma } from "../db.ts";
import { Conflit, NonTrouve, RequeteInvalide } from "../erreurs.ts";
import * as emprunts from "../repositories/emprunts.ts";
import * as ouvrages from "../repositories/ouvrages.ts";
import * as reservations from "../repositories/reservations.ts";
import type { ModifierEmprunt } from "../schemas/emprunts.ts";
import type { PorteeEmprunts } from "../types/domaine.ts";

const JOUR_MS = 24 * 60 * 60 * 1000;

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
      throw new Conflit(`Ouvrage ${ouvrageId} indisponible : il est déjà emprunté (réservez-le)`);
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
 * Un ouvrage vient d'être libéré : la réservation active la plus ancienne devient un emprunt
 * (l'ouvrage reste indisponible) ; sans réservation, l'ouvrage redevient disponible.
 * À appeler dans la transaction qui libère l'ouvrage.
 */
async function libererOuvrage(ouvrageId: number, dureeEmpruntJours: number, tx: ClientDb) {
  await ouvrages.verrouiller(ouvrageId, tx);
  const suivante = await reservations.plusAncienneActive(ouvrageId, tx);
  if (!suivante) {
    await ouvrages.definirDisponibilite(ouvrageId, true, tx);
    return null;
  }
  const maintenant = new Date();
  const emprunt = await emprunts.creer(
    {
      ouvrageId,
      emprunteurId: suivante.membreId,
      dateEmprunt: maintenant,
      dateRetourPrevue: new Date(maintenant.getTime() + dureeEmpruntJours * JOUR_MS),
    },
    tx,
  );
  await reservations.honorer(suivante.id, emprunt.id, tx);
  return emprunt;
}

/**
 * Marque l'emprunt rendu et, dans la même transaction, sert la réservation la plus ancienne
 * de l'ouvrage ou le rend disponible.
 */
export async function retourner(id: number, portee: PorteeEmprunts, dureeEmpruntJours: number) {
  return prisma.$transaction(async (tx) => {
    if (!(await emprunts.marquerRenduSiEnCours(id, portee, tx))) {
      if (!(await emprunts.existe(id, portee, tx))) throw new NonTrouve(`Emprunt ${id} introuvable`);
      throw new Conflit(`Emprunt ${id} déjà rendu`);
    }
    const rendu = await emprunts.trouver(id, {}, tx);
    const empruntSuivant = await libererOuvrage(rendu.ouvrageId, dureeEmpruntJours, tx);
    return { ...rendu, empruntSuivantId: empruntSuivant?.id ?? null };
  });
}

/** Supprimer un emprunt en cours libère l'ouvrage (et sert la file de réservations). */
export async function supprimer(id: number, dureeEmpruntJours: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const emprunt = await emprunts.supprimer(id, tx);
    if (!emprunt.rendu) await libererOuvrage(emprunt.ouvrageId, dureeEmpruntJours, tx);
  });
}
