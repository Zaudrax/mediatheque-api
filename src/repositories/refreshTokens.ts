import { type ClientDb, prisma } from "../db.ts";

export function enregistrer(
  { jti, utilisateurId, expireLe }: { jti: string; utilisateurId: number; expireLe: Date },
  client: ClientDb = prisma,
) {
  return client.refreshToken.create({ data: { id: jti, utilisateurId, expireLe } });
}

export function trouver(jti: string) {
  return prisma.refreshToken.findUnique({ where: { id: jti } });
}

/**
 * Révoque un jeton encore actif. Renvoie true si c'est cet appel qui l'a révoqué :
 * deux rafraîchissements simultanés avec le même jeton ne peuvent pas réussir tous les deux.
 */
export async function revoquerSiActif(jti: string, client: ClientDb = prisma): Promise<boolean> {
  const { count } = await client.refreshToken.updateMany({
    where: { id: jti, revoqueLe: null, expireLe: { gt: new Date() } },
    data: { revoqueLe: new Date() },
  });
  return count === 1;
}

export function revoquerTous(utilisateurId: number) {
  return prisma.refreshToken.updateMany({
    where: { utilisateurId, revoqueLe: null },
    data: { revoqueLe: new Date() },
  });
}
