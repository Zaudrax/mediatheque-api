import { prisma } from "../db.ts";

/** Champs publics : le hachage du mot de passe ne sort jamais de cette couche, sauf pour la connexion. */
export const champsPublics = { id: true, email: true, role: true, creeLe: true } as const;

export function creer({ email, motDePasseHache }: { email: string; motDePasseHache: string }) {
  // Le rôle n'est jamais lu depuis la requête : toute inscription crée un membre.
  return prisma.utilisateur.create({
    data: { email, motDePasseHache, role: "membre" },
    select: champsPublics,
  });
}

/** Pour la connexion uniquement : renvoie aussi le hachage. */
export function trouverParEmailAvecHache(email: string) {
  return prisma.utilisateur.findUnique({
    where: { email },
    select: { ...champsPublics, motDePasseHache: true },
  });
}

export function trouver(id: number) {
  return prisma.utilisateur.findUnique({ where: { id }, select: champsPublics });
}
