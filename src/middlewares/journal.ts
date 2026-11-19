import type { RequestHandler } from "express";

/** Une ligne par requête : date, méthode, chemin, statut, durée. Ni corps ni en-têtes. */
export const journal: RequestHandler = (req, res, next) => {
  const debut = process.hrtime.bigint();
  res.on("finish", () => {
    const duree = Number(process.hrtime.bigint() - debut) / 1e6;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duree.toFixed(1)} ms`,
    );
  });
  next();
};
