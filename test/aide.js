/**
 * Outils communs aux tests : démarrage de l'application sur un port éphémère,
 * remise à zéro de la base de test et connexion des comptes de test.
 */
import { creerApp } from "../src/app.js";
import { lireConfig } from "../src/config.js";
import { prisma } from "../src/db.js";
import { hacherMotDePasse } from "../src/services/auth.js";

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
};

let hache;

/** Vide la base puis insère 3 comptes, 3 ouvrages et un emprunt en cours par membre. */
export async function reinitialiserBase() {
  hache ??= await hacherMotDePasse(MOT_DE_PASSE);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`TRUNCATE TABLE refresh_tokens, emprunts, ouvrages, utilisateurs RESTART IDENTITY CASCADE`;
    await tx.utilisateur.createMany({
      data: [
        { email: comptes.bibliothecaire.email, motDePasseHache: hache, role: "bibliothecaire" },
        { email: comptes.alice.email, motDePasseHache: hache, role: "membre" },
        { email: comptes.bruno.email, motDePasseHache: hache, role: "membre" },
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

/**
 * Démarre l'application sur un port éphémère (port 0 : le système en choisit un libre).
 * `surcharge` permet d'ajuster la configuration, par exemple les limites de débit.
 */
export async function demarrer(surcharge = {}) {
  const config = { ...lireConfig(), ...surcharge };
  const serveur = creerApp(config).listen(0);
  await new Promise((resolve) => serveur.once("listening", resolve));
  const { port } = serveur.address();
  return {
    base: `http://127.0.0.1:${port}`,
    fermer: () => new Promise((resolve) => serveur.close(resolve)),
  };
}

export async function fermerBase() {
  await prisma.$disconnect();
}

/** fetch + décodage JSON. Renvoie { statut, corps, entetes }. */
export async function appeler(base, chemin, { methode = "GET", jeton, corps, entetes = {} } = {}) {
  const reponse = await fetch(base + chemin, {
    method: methode,
    headers: {
      ...(corps !== undefined && { "Content-Type": "application/json" }),
      ...(jeton && { Authorization: `Bearer ${jeton}` }),
      ...entetes,
    },
    body: corps === undefined ? undefined : typeof corps === "string" ? corps : JSON.stringify(corps),
  });
  const texte = await reponse.text();
  return {
    statut: reponse.status,
    corps: texte ? JSON.parse(texte) : null,
    entetes: reponse.headers,
  };
}

/** Connecte un compte de test et renvoie { accessToken, refreshToken, utilisateur }. */
export async function connecter(base, email, motDePasse = MOT_DE_PASSE) {
  const { statut, corps } = await appeler(base, "/api/auth/connexion", {
    methode: "POST",
    corps: { email, motDePasse },
  });
  if (statut !== 200) throw new Error(`Connexion de ${email} impossible (${statut})`);
  return corps;
}
