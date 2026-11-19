-- CreateEnum
CREATE TYPE "StatutReservation" AS ENUM ('active', 'honoree', 'annulee');

-- CreateTable
CREATE TABLE "reservations" (
    "id" SERIAL NOT NULL,
    "ouvrage_id" INTEGER NOT NULL,
    "membre_id" INTEGER NOT NULL,
    "statut" "StatutReservation" NOT NULL DEFAULT 'active',
    "active" BOOLEAN DEFAULT true,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,
    "emprunt_id" INTEGER,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_emprunt_id_key" ON "reservations"("emprunt_id");

-- CreateIndex
CREATE INDEX "reservations_ouvrage_id_statut_cree_le_idx" ON "reservations"("ouvrage_id", "statut", "cree_le");

-- CreateIndex
CREATE INDEX "reservations_membre_id_idx" ON "reservations"("membre_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_ouvrage_id_membre_id_active_key" ON "reservations"("ouvrage_id", "membre_id", "active");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_ouvrage_id_fkey" FOREIGN KEY ("ouvrage_id") REFERENCES "ouvrages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_membre_id_fkey" FOREIGN KEY ("membre_id") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_emprunt_id_fkey" FOREIGN KEY ("emprunt_id") REFERENCES "emprunts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

