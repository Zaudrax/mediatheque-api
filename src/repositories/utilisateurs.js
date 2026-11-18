import { prisma } from "../db.js";

/** Champs publics : le hachage du mot de passe ne sort jamais de cette couche, sauf pour la connexion. */
export const champsPublics = { id: true, email: true, role: true, creeLe: true };

export function creer({ email, motDePasseHache }) {
  // Le rôle n'est jamais lu depuis la requête : toute inscription crée un membre.
  return prisma.utilisateur.create({
    data: { email, motDePasseHache, role: "membre" },
    select: champsPublics,
  });
}

/** Pour la connexion uniquement : renvoie aussi le hachage. */
export function trouverParEmailAvecHache(email) {
  return prisma.utilisateur.findUnique({
    where: { email },
    select: { ...champsPublics, motDePasseHache: true },
  });
}

export function trouver(id) {
  return prisma.utilisateur.findUnique({ where: { id }, select: champsPublics });
}
