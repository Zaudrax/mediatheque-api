-- Les emprunteurs du TP 1 étaient de simples prénoms : ils ne peuvent pas être rattachés
-- à un compte utilisateur. Les emprunts existants (données de démonstration) sont supprimés
-- et les ouvrages libérés ; le seeder recrée des emprunts liés aux comptes de démonstration.
DELETE FROM "emprunts";
UPDATE "ouvrages" SET "disponible" = true;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('membre', 'bibliothecaire');

-- AlterTable
ALTER TABLE "emprunts" DROP COLUMN "emprunteur",
ADD COLUMN     "emprunteur_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "mot_de_passe_hache" VARCHAR(100) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'membre',
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "utilisateur_id" INTEGER NOT NULL,
    "expire_le" TIMESTAMP(3) NOT NULL,
    "revoque_le" TIMESTAMP(3),
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_utilisateur_id_idx" ON "refresh_tokens"("utilisateur_id");

-- CreateIndex
CREATE INDEX "emprunts_emprunteur_id_idx" ON "emprunts"("emprunteur_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emprunts" ADD CONSTRAINT "emprunts_emprunteur_id_fkey" FOREIGN KEY ("emprunteur_id") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

