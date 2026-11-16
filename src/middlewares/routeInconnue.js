/** Placé après toutes les routes : toute requête non traitée reçoit un 404 JSON. */
export function routeInconnue(req, res) {
  res.status(404).json({ erreur: `Route introuvable : ${req.method} ${req.originalUrl}` });
}
