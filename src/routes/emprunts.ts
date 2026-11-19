import { Router } from "express";
import type { Config } from "../config.ts";
import { estBibliothecaire, exigerRole, porteeEmprunts, utilisateurDe } from "../middlewares/authentifier.ts";
import { valider } from "../middlewares/valider.ts";
import * as emprunts from "../repositories/emprunts.ts";
import { paramsId, reponsePaginee } from "../schemas/commun.ts";
import { creerEmprunt, listerEmprunts, modifierEmprunt } from "../schemas/emprunts.ts";
import * as serviceEmprunts from "../services/emprunts.ts";

/**
 * Monté derrière authentifier().
 * Un membre ne voit, ne crée, ne modifie et ne clôture que ses propres emprunts ;
 * un bibliothécaire accède à tous les emprunts et peut seul en supprimer.
 */
export function routeurEmprunts(config: Config): Router {
  const routeur = Router();

  routeur.get(
    "/",
    valider({ query: listerEmprunts }, async ({ query }, req, res) => {
      const page = await emprunts.lister(query, porteeEmprunts(utilisateurDe(req)));
      res.json(reponsePaginee(page, query.page, query.limite));
    }),
  );

  routeur.get(
    "/:id",
    valider({ params: paramsId }, async ({ params }, req, res) => {
      res.json(await emprunts.trouver(params.id, porteeEmprunts(utilisateurDe(req))));
    }),
  );

  routeur.post(
    "/",
    valider({ body: creerEmprunt }, async ({ body }, req, res) => {
      const utilisateur = utilisateurDe(req);
      // Un membre emprunte toujours pour lui-même ; un bibliothécaire peut emprunter au nom d'un membre.
      const emprunteurId = estBibliothecaire(utilisateur) ? (body.emprunteurId ?? utilisateur.id) : utilisateur.id;
      const emprunt = await serviceEmprunts.creer({ ...body, emprunteurId });
      res.status(201).location(`${req.baseUrl}/${emprunt.id}`).json(emprunt);
    }),
  );

  routeur.post(
    "/:id/retour",
    valider({ params: paramsId }, async ({ params }, req, res) => {
      const portee = porteeEmprunts(utilisateurDe(req));
      res.json(await serviceEmprunts.retourner(params.id, portee, config.dureeEmpruntJours));
    }),
  );

  routeur.patch(
    "/:id",
    valider({ params: paramsId, body: modifierEmprunt }, async ({ params, body }, req, res) => {
      res.json(await serviceEmprunts.modifier(params.id, body, porteeEmprunts(utilisateurDe(req))));
    }),
  );

  routeur.delete(
    "/:id",
    exigerRole("bibliothecaire"),
    valider({ params: paramsId }, async ({ params }, _req, res) => {
      await serviceEmprunts.supprimer(params.id, config.dureeEmpruntJours);
      res.status(204).end();
    }),
  );

  return routeur;
}
