-- Archivage logique des ouvrages : NULL = ouvrage au catalogue, date = ouvrage archivé.
ALTER TABLE "ouvrages" ADD COLUMN "archive_le" TIMESTAMP(3);
