import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { ConfigJwt } from "../config.ts";
import { type ClientDb, prisma } from "../db.ts";
import { Conflit, NonAuthentifie } from "../erreurs.ts";
import { Prisma } from "../generated/prisma/client.ts";
import * as refreshTokens from "../repositories/refreshTokens.ts";
import * as utilisateurs from "../repositories/utilisateurs.ts";
import type { Connexion, Inscription } from "../schemas/auth.ts";
import type { Role } from "../types/domaine.ts";
import { signerAccess, signerRefresh, verifierRefresh } from "./jetons.ts";

export const COUT_BCRYPT = 12;

const IDENTIFIANTS_INVALIDES = "E-mail ou mot de passe incorrect";
const REFRESH_INVALIDE = "Refresh token invalide ou expiré";

// Hachage leurre : comparer le mot de passe même quand le compte n'existe pas
// rend la durée de réponse identique et ne révèle pas quels e-mails sont inscrits.
let hacheLeurre: Promise<string> | undefined;

export function hacherMotDePasse(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, COUT_BCRYPT);
}

interface CompteJetons {
  id: number;
  email: string;
  role: Role;
}

async function emettreJetons(jwt: ConfigJwt, utilisateur: CompteJetons, client?: ClientDb) {
  const accessToken = await signerAccess(jwt, utilisateur);
  const refresh = await signerRefresh(jwt, utilisateur.id);
  await refreshTokens.enregistrer(
    { jti: refresh.jti, utilisateurId: utilisateur.id, expireLe: refresh.expireLe },
    client,
  );
  return {
    tokenType: "Bearer" as const,
    accessToken,
    refreshToken: refresh.jeton,
    utilisateur: { id: utilisateur.id, email: utilisateur.email, role: utilisateur.role },
  };
}

export async function inscrire({ email, motDePasse }: Inscription) {
  const motDePasseHache = await hacherMotDePasse(motDePasse);
  try {
    return await utilisateurs.creer({ email, motDePasseHache });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Conflit("Un compte existe déjà avec cet e-mail");
    }
    throw err;
  }
}

export async function connecter(jwt: ConfigJwt, { email, motDePasse }: Connexion) {
  const utilisateur = await utilisateurs.trouverParEmailAvecHache(email);
  hacheLeurre ??= hacherMotDePasse(randomUUID());
  const valide = await bcrypt.compare(motDePasse, utilisateur?.motDePasseHache ?? (await hacheLeurre));
  if (!utilisateur || !valide) throw new NonAuthentifie(IDENTIFIANTS_INVALIDES);
  return emettreJetons(jwt, utilisateur);
}

/**
 * Rotation : le refresh token présenté est révoqué et remplacé par une nouvelle paire.
 * Présenter un jeton déjà révoqué signale un vol probable : tous les jetons du compte sont révoqués.
 */
export async function rafraichir(jwt: ConfigJwt, refreshToken: string) {
  let charge: Awaited<ReturnType<typeof verifierRefresh>>;
  try {
    charge = await verifierRefresh(jwt, refreshToken);
  } catch {
    throw new NonAuthentifie(REFRESH_INVALIDE);
  }

  const enregistre = await refreshTokens.trouver(charge.jti);
  if (!enregistre || enregistre.utilisateurId !== charge.utilisateurId) {
    throw new NonAuthentifie(REFRESH_INVALIDE);
  }
  if (enregistre.revoqueLe) {
    await refreshTokens.revoquerTous(enregistre.utilisateurId);
    throw new NonAuthentifie("Refresh token révoqué");
  }

  const utilisateur = await utilisateurs.trouver(charge.utilisateurId);
  if (!utilisateur) throw new NonAuthentifie(REFRESH_INVALIDE);

  return prisma.$transaction(async (tx) => {
    const revoque = await refreshTokens.revoquerSiActif(charge.jti, tx);
    if (!revoque) throw new NonAuthentifie(REFRESH_INVALIDE);
    return emettreJetons(jwt, utilisateur, tx);
  });
}

export async function deconnecter(utilisateurId: number): Promise<void> {
  await refreshTokens.revoquerTous(utilisateurId);
}
