/**
 * Seeder rejouable : vide les tables et remet les compteurs d'identifiants à zéro,
 * puis insère 3 comptes, 10 ouvrages et 3 emprunts (dont un rendu). Relancé, il produit
 * toujours le même jeu de données, sans doublon.
 * Comptes fictifs en @example.net ; mots de passe de démonstration documentés dans le README.
 *
 * Garde-fou : le seeder VIDE toutes les tables. Il refuse de tourner quand NODE_ENV=production.
 */
if (process.env.NODE_ENV === "production") {
  console.error("Seed refusé : NODE_ENV=production. Le seeder vide toutes les tables (TRUNCATE).");
  process.exit(1);
}

// Imports dynamiques : rien n'est chargé (ni connexion ouverte) si le garde-fou refuse.
const { prisma } = await import("../src/db.ts");
const { hacherMotDePasse } = await import("../src/services/auth.ts");

const MOT_DE_PASSE_BIBLIOTHECAIRE = "Biblio-Demo-2026!";
const MOT_DE_PASSE_MEMBRE = "Membre-Demo-2026!";

const ouvrages = [
  { titre: "Les Misérables", auteur: "Victor Hugo", annee: 1862 },
  { titre: "Madame Bovary", auteur: "Gustave Flaubert", annee: 1857 },
  { titre: "Le Rouge et le Noir", auteur: "Stendhal", annee: 1830 },
  { titre: "Germinal", auteur: "Émile Zola", annee: 1885 },
  { titre: "Le Comte de Monte-Cristo", auteur: "Alexandre Dumas", annee: 1844 },
  { titre: "Candide", auteur: "Voltaire", annee: 1759 },
  { titre: "Les Fleurs du mal", auteur: "Charles Baudelaire", annee: 1857 },
  { titre: "Vingt mille lieues sous les mers", auteur: "Jules Verne", annee: 1870 },
  { titre: "Bel-Ami", auteur: "Guy de Maupassant", annee: 1885 },
  { titre: "L'Étranger", auteur: "Albert Camus", annee: 1942 },
];

const jour = (decalage: number): Date => new Date(Date.now() + decalage * 24 * 60 * 60 * 1000);

async function main(): Promise<void> {
  // Hachages calculés hors transaction (bcrypt, coût 12, prend quelques centaines de ms).
  const [hacheBiblio, hacheMembre] = await Promise.all([
    hacherMotDePasse(MOT_DE_PASSE_BIBLIOTHECAIRE),
    hacherMotDePasse(MOT_DE_PASSE_MEMBRE),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`TRUNCATE TABLE refresh_tokens, emprunts, ouvrages, utilisateurs RESTART IDENTITY CASCADE`;

    // Identifiants 1, 2 et 3 dans cet ordre.
    await tx.utilisateur.createMany({
      data: [
        { email: "bibliothecaire@example.net", motDePasseHache: hacheBiblio, role: "bibliothecaire" },
        { email: "camille@example.net", motDePasseHache: hacheMembre, role: "membre" },
        { email: "leon@example.net", motDePasseHache: hacheMembre, role: "membre" },
      ],
    });
    await tx.ouvrage.createMany({ data: ouvrages });

    // Deux emprunts en cours : les ouvrages 1 et 4 deviennent indisponibles.
    await tx.emprunt.createMany({
      data: [
        { ouvrageId: 1, emprunteurId: 2, dateEmprunt: jour(-5), dateRetourPrevue: jour(16) },
        { ouvrageId: 4, emprunteurId: 3, dateEmprunt: jour(-2), dateRetourPrevue: jour(19) },
        {
          ouvrageId: 2,
          emprunteurId: 2,
          dateEmprunt: jour(-30),
          dateRetourPrevue: jour(-9),
          rendu: true,
          renduLe: jour(-10),
        },
      ],
    });
    await tx.ouvrage.updateMany({ where: { id: { in: [1, 4] } }, data: { disponible: false } });
  });

  const [nbUtilisateurs, nbOuvrages, nbEmprunts] = await Promise.all([
    prisma.utilisateur.count(),
    prisma.ouvrage.count(),
    prisma.emprunt.count(),
  ]);
  console.log(
    `Seed terminé : ${nbUtilisateurs} utilisateurs, ${nbOuvrages} ouvrages, ${nbEmprunts} emprunts.`,
  );
}

try {
  await main();
} catch (err) {
  console.error("Échec du seed :", err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
