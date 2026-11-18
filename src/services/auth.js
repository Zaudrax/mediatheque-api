import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { Conflit, NonAuthentifie } from "../erreurs.js";
import * as refreshTokens from "../repositories/refreshTokens.js";
import * as utilisateurs from "../repositories/utilisateurs.js";
import { signerAccess, signerRefresh, verifierRefresh } from "./jetons.js";

export const COUT_BCRYPT = 12;

const IDENTIFIANTS_INVALIDES = "E-mail ou mot de passe incorrect";

// Hachage leurre : comparer le mot de passe même quand le compte n'existe pas
// rend la durée de réponse identique et ne révèle pas quels e-mails sont inscrits.
const hacheLeurre = bcrypt.hash(randomUUID(), COUT_BCRYPT);

export function hacherMotDePasse(motDePasse) {
  return bcrypt.hash(motDePasse, COUT_BCRYPT);
}

async function emettreJetons(jwt, utilisateur, client) {
  const accessToken = await signerAccess(jwt, utilisateur);
  const refresh = await signerRefresh(jwt, utilisateur.id);
  await refreshTokens.enregistrer(
    { jti: refresh.jti, utilisateurId: utilisateur.id, expireLe: refresh.expireLe },
    client,
  );
  return {
    tokenType: "Bearer",
    accessToken,
    refreshToken: refresh.jeton,
    utilisateur: { id: utilisateur.id, email: utilisateur.email, role: utilisateur.role },
  };
}

export async function inscrire({ email, motDePasse }) {
  const motDePasseHache = await hacherMotDePasse(motDePasse);
  try {
    return await utilisateurs.creer({ email, motDePasseHache });
  } catch (err) {
    if (err.code === "P2002") throw new Conflit("Un compte existe déjà avec cet e-mail");
    throw err;
  }
}

export async function connecter(jwt, { email, motDePasse }) {
  const utilisateur = await utilisateurs.trouverParEmailAvecHache(email);
  const valide = await bcrypt.compare(motDePasse, utilisateur?.motDePasseHache ?? (await hacheLeurre));
  if (!utilisateur || !valide) throw new NonAuthentifie(IDENTIFIANTS_INVALIDES);
  return emettreJetons(jwt, utilisateur);
}

/**
 * Rotation : le refresh token présenté est révoqué et remplacé par une nouvelle paire.
 * Présenter un jeton déjà révoqué signale un vol probable : tous les jetons du compte sont révoqués.
 */
export async function rafraichir(jwt, refreshToken) {
  let charge;
  try {
    charge = await verifierRefresh(jwt, refreshToken);
  } catch {
    throw new NonAuthentifie("Refresh token invalide ou expiré");
  }

  const enregistre = await refreshTokens.trouver(charge.jti);
  if (!enregistre || enregistre.utilisateurId !== charge.utilisateurId) {
    throw new NonAuthentifie("Refresh token invalide ou expiré");
  }
  if (enregistre.revoqueLe) {
    await refreshTokens.revoquerTous(enregistre.utilisateurId);
    throw new NonAuthentifie("Refresh token révoqué");
  }

  const utilisateur = await utilisateurs.trouver(charge.utilisateurId);
  if (!utilisateur) throw new NonAuthentifie("Refresh token invalide ou expiré");

  return prisma.$transaction(async (tx) => {
    const revoque = await refreshTokens.revoquerSiActif(charge.jti, tx);
    if (!revoque) throw new NonAuthentifie("Refresh token invalide ou expiré");
    return emettreJetons(jwt, utilisateur, tx);
  });
}

export async function deconnecter(utilisateurId) {
  await refreshTokens.revoquerTous(utilisateurId);
}
