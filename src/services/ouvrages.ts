import { prisma } from "../db.ts";
import { Conflit, NonTrouve } from "../erreurs.ts";
import * as ouvrages from "../repositories/ouvrages.ts";

/**
 * Retire un ouvrage du catalogue.
 * - emprunté : 409 ;
 * - sans aucun emprunt ni réservation : supprimé définitivement ;
 * - avec un historique : archivé (archiveLe renseigné). Il n'apparaît plus dans le catalogue,
 *   ne peut plus être emprunté, réservé ni modifié, et son historique reste consultable.
 * Renvoie « supprime » ou « archive ».
 */
export async function supprimer(id: number): Promise<"supprime" | "archive"> {
  return prisma.$transaction(async (tx) => {
    if (!(await ouvrages.verrouiller(id, tx))) throw new NonTrouve(`Ouvrage ${id} introuvable`);
    if ((await ouvrages.compterEmpruntsEnCours(id, tx)) > 0) {
      throw new Conflit(`Ouvrage ${id} actuellement emprunté : suppression impossible`);
    }
    if ((await ouvrages.compterHistorique(id, tx)) === 0) {
      await ouvrages.supprimer(id, tx);
      return "supprime";
    }
    await ouvrages.archiver(id, tx);
    return "archive";
  });
}
