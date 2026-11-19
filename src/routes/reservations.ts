import { Router } from "express";
import { estBibliothecaire, porteeReservations, utilisateurDe } from "../middlewares/authentifier.ts";
import { valider } from "../middlewares/valider.ts";
import * as reservations from "../repositories/reservations.ts";
import { paramsId, reponsePaginee } from "../schemas/commun.ts";
import { creerReservation, listerReservations } from "../schemas/reservations.ts";
import * as serviceReservations from "../services/reservations.ts";

/**
 * Monté derrière authentifier().
 * Un membre réserve pour lui-même, liste et annule ses réservations ;
 * un bibliothécaire voit et annule toutes les réservations.
 */
export function routeurReservations(): Router {
  const routeur = Router();

  routeur.get(
    "/",
    valider({ query: listerReservations }, async ({ query }, req, res) => {
      const page = await reservations.lister(query, porteeReservations(utilisateurDe(req)));
      res.json(reponsePaginee(page, query.page, query.limite));
    }),
  );

  routeur.get(
    "/:id",
    valider({ params: paramsId }, async ({ params }, req, res) => {
      res.json(await reservations.trouver(params.id, porteeReservations(utilisateurDe(req))));
    }),
  );

  routeur.post(
    "/",
    valider({ body: creerReservation }, async ({ body }, req, res) => {
      const utilisateur = utilisateurDe(req);
      const membreId = estBibliothecaire(utilisateur) ? (body.membreId ?? utilisateur.id) : utilisateur.id;
      const reservation = await serviceReservations.creer({ ouvrageId: body.ouvrageId, membreId });
      res.status(201).location(`${req.baseUrl}/${reservation.id}`).json(reservation);
    }),
  );

  /** Annulation : la réservation est conservée avec le statut « annulee ». */
  routeur.delete(
    "/:id",
    valider({ params: paramsId }, async ({ params }, req, res) => {
      await serviceReservations.annuler(params.id, porteeReservations(utilisateurDe(req)));
      res.status(204).end();
    }),
  );

  return routeur;
}
