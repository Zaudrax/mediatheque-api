/**
 * Seeder rejouable : vide les deux tables et remet les compteurs d'identifiants à zéro,
 * puis insère 10 ouvrages et 3 emprunts (dont un rendu). Relancé, il produit toujours
 * le même jeu de données, sans doublon. Les emprunteurs sont des prénoms fictifs.
 */
import { prisma } from "../src/db.js";

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

const jour = (decalage) => new Date(Date.now() + decalage * 24 * 60 * 60 * 1000);

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`TRUNCATE TABLE emprunts, ouvrages RESTART IDENTITY CASCADE`;
    await tx.ouvrage.createMany({ data: ouvrages });

    // Deux emprunts en cours : les ouvrages 1 et 4 deviennent indisponibles.
    await tx.emprunt.createMany({
      data: [
        { ouvrageId: 1, emprunteur: "Camille", dateEmprunt: jour(-5), dateRetourPrevue: jour(16) },
        { ouvrageId: 4, emprunteur: "Léon", dateEmprunt: jour(-2), dateRetourPrevue: jour(19) },
        {
          ouvrageId: 2,
          emprunteur: "Inès",
          dateEmprunt: jour(-30),
          dateRetourPrevue: jour(-9),
          rendu: true,
          renduLe: jour(-10),
        },
      ],
    });
    await tx.ouvrage.updateMany({ where: { id: { in: [1, 4] } }, data: { disponible: false } });
  });

  const [nbOuvrages, nbEmprunts] = await Promise.all([prisma.ouvrage.count(), prisma.emprunt.count()]);
  console.log(`Seed terminé : ${nbOuvrages} ouvrages, ${nbEmprunts} emprunts.`);
}

try {
  await main();
} catch (err) {
  console.error("Échec du seed :", err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
