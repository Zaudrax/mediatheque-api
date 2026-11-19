/**
 * Outils communs aux tests : démarrage de l'application sur un port éphémère,
 * remise à zéro de la base de test et connexion des comptes de test.
 */
import type { AddressInfo } from "node:net";
import { creerApp } from "../src/app.ts";
import { type Config, lireConfig } from "../src/config.ts";
import { prisma } from "../src/db.ts";
import { hacherMotDePasse } from "../src/services/auth.ts";

// Garde-fou : les tests vident la base, ils refusent de tourner ailleurs que sur une base de test.
if (process.env.NODE_ENV !== "test" || !/_test\b/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error(
    "Les tests exigent NODE_ENV=test et une base dont le nom finit par _test (voir .env.test.example).",
  );
}

export const MOT_DE_PASSE = "Mot-de-passe-de-test-1";

export const comptes = {
  bibliothecaire: { id: 1, email: "biblio.test@example.net" },
  alice: { id: 2, email: "alice.test@example.net" },
  bruno: { id: 3, email: "bruno.test@example.net" },
} as const;

let hache: string | undefined;

/**
 * Vide la base puis insère 3 comptes, 3 ouvrages et un emprunt en cours par membre :
 * ouvrage 1 « Germinal » emprunté par Alice (emprunt 1), ouvrage 2 « Candide » par Bruno (emprunt 2),
 * ouvrage 3 « Bel-Ami » disponible.
 */
export async function reinitialiserBase(): Promise<void> {
  hache ??= await hacherMotDePasse(MOT_DE_PASSE);
  const motDePasseHache = hache;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`TRUNCATE TABLE refresh_tokens, reservations, emprunts, ouvrages, utilisateurs RESTART IDENTITY CASCADE`;
    await tx.utilisateur.createMany({
      data: [
        { email: comptes.bibliothecaire.email, motDePasseHache, role: "bibliothecaire" },
        { email: comptes.alice.email, motDePasseHache, role: "membre" },
        { email: comptes.bruno.email, motDePasseHache, role: "membre" },
      ],
    });
    await tx.ouvrage.createMany({
      data: [
        { titre: "Germinal", auteur: "Émile Zola", annee: 1885, disponible: false },
        { titre: "Candide", auteur: "Voltaire", annee: 1759, disponible: false },
        { titre: "Bel-Ami", auteur: "Guy de Maupassant", annee: 1885 },
      ],
    });
    const retour = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await tx.emprunt.createMany({
      data: [
        { ouvrageId: 1, emprunteurId: 2, dateEmprunt: new Date(), dateRetourPrevue: retour },
        { ouvrageId: 2, emprunteurId: 3, dateEmprunt: new Date(), dateRetourPrevue: retour },
      ],
    });
  });
}

export interface ApiDeTest {
  base: string;
  fermer(): Promise<void>;
}

/**
 * Démarre l'application sur un port éphémère (port 0 : le système en choisit un libre).
 * `surcharge` permet d'ajuster la configuration, par exemple les limites de débit.
 */
export async function demarrer(surcharge: Partial<Config> = {}): Promise<ApiDeTest> {
  const config: Config = { ...lireConfig(), ...surcharge };
  const serveur = creerApp(config).listen(0);
  await new Promise<void>((resolve) => serveur.once("listening", () => resolve()));
  const { port } = serveur.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    fermer: () =>
      new Promise<void>((resolve) => {
        serveur.closeAllConnections();
        serveur.close(() => resolve());
      }),
  };
}

export async function fermerBase(): Promise<void> {
  await prisma.$disconnect();
}

export interface OptionsAppel {
  methode?: "GET" | "POST" | "PATCH" | "DELETE";
  jeton?: string;
  corps?: unknown;
  entetes?: Record<string, string>;
}

// Les réponses JSON sont lues sans type précis : chaque test vérifie ce qu'il attend.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface Reponse {
  statut: number;
  corps: Json;
  texte: string;
  entetes: Headers;
}

/** fetch + décodage JSON. */
export async function appeler(
  base: string,
  chemin: string,
  { methode = "GET", jeton, corps, entetes = {} }: OptionsAppel = {},
): Promise<Reponse> {
  const reponse = await fetch(base + chemin, {
    method: methode,
    headers: {
      ...(corps !== undefined && { "Content-Type": "application/json" }),
      ...(jeton && { Authorization: `Bearer ${jeton}` }),
      ...entetes,
    },
    body: corps === undefined ? null : typeof corps === "string" ? corps : JSON.stringify(corps),
  });
  const texte = await reponse.text();
  let json: Json = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    json = null; // flux SSE, page HTML…
  }
  return { statut: reponse.status, corps: json, texte, entetes: reponse.headers };
}

export interface JetonsConnexion {
  tokenType: "Bearer";
  accessToken: string;
  refreshToken: string;
  utilisateur: { id: number; email: string; role: string };
}

/** Connecte un compte de test et renvoie ses jetons. */
export async function connecter(base: string, email: string, motDePasse = MOT_DE_PASSE): Promise<JetonsConnexion> {
  const { statut, corps } = await appeler(base, "/api/auth/connexion", {
    methode: "POST",
    corps: { email, motDePasse },
  });
  if (statut !== 200) throw new Error(`Connexion de ${email} impossible (${statut})`);
  return corps as JetonsConnexion;
}

/** Connecte les trois comptes de test et renvoie leurs access tokens. */
export async function connecterTous(base: string) {
  const [bibliothecaire, alice, bruno] = await Promise.all([
    connecter(base, comptes.bibliothecaire.email),
    connecter(base, comptes.alice.email),
    connecter(base, comptes.bruno.email),
  ]);
  return {
    bibliothecaire: bibliothecaire.accessToken,
    alice: alice.accessToken,
    bruno: bruno.accessToken,
  };
}

export const dansDeuxSemaines = (): string => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
