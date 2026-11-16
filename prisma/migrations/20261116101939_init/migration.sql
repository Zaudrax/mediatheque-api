-- CreateTable
CREATE TABLE "ouvrages" (
    "id" SERIAL NOT NULL,
    "titre" VARCHAR(150) NOT NULL,
    "auteur" VARCHAR(120) NOT NULL,
    "annee" INTEGER NOT NULL,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ouvrages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emprunts" (
    "id" SERIAL NOT NULL,
    "ouvrage_id" INTEGER NOT NULL,
    "emprunteur" VARCHAR(80) NOT NULL,
    "date_emprunt" TIMESTAMP(3) NOT NULL,
    "date_retour_prevue" TIMESTAMP(3) NOT NULL,
    "rendu" BOOLEAN NOT NULL DEFAULT false,
    "rendu_le" TIMESTAMP(3),
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emprunts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ouvrages_disponible_idx" ON "ouvrages"("disponible");

-- CreateIndex
CREATE INDEX "emprunts_ouvrage_id_idx" ON "emprunts"("ouvrage_id");

-- CreateIndex
CREATE INDEX "emprunts_rendu_idx" ON "emprunts"("rendu");

-- AddForeignKey
ALTER TABLE "emprunts" ADD CONSTRAINT "emprunts_ouvrage_id_fkey" FOREIGN KEY ("ouvrage_id") REFERENCES "ouvrages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
