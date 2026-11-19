import { Router } from "express";
import { exigerRole, porteeEmprunts, utilisateurDe } from "../middlewares/authentifier.ts";
import { valider } from "../middlewares/valider.ts";
import * as ouvrages from "../repositories/ouvrages.ts";
import { paramsId, reponsePaginee } from "../schemas/commun.ts";
import { creerOuvrage, listerOuvrages, modifierOuvrage } from "../schemas/ouvrages.ts";
import * as serviceOuvrages from "../services/ouvrages.ts";

/**
 * Monté derrière authentifier() : lecture pour tout utilisateur connecté,
 * écriture réservée aux bibliothécaires.
 * Express 5 transmet automatiquement les rejets de promesse au gestionnaire d'erreurs.
 */
export function routeurOuvrages(): Router {
  const routeur = Router();
  const bibliothecaire = exigerRole("bibliothecaire");

  routeur.get(
    "/",
    valider({ query: listerOuvrages }, async ({ query }, _req, res) => {
      res.json(reponsePaginee(await ouvrages.lister(query), query.page, query.limite));
    }),
  );

  routeur.get(
    "/:id",
    valider({ params: paramsId }, async ({ params }, req, res) => {
      // Un membre ne voit que ses propres emprunts en cours sur cet ouvrage.
      res.json(await ouvrages.trouver(params.id, porteeEmprunts(utilisateurDe(req))));
    }),
  );

  routeur.post(
    "/",
    bibliothecaire,
    valider({ body: creerOuvrage }, async ({ body }, req, res) => {
      const ouvrage = await ouvrages.creer(body);
      res.status(201).location(`${req.baseUrl}/${ouvrage.id}`).json(ouvrage);
    }),
  );

  routeur.patch(
    "/:id",
    bibliothecaire,
    valider({ params: paramsId, body: modifierOuvrage }, async ({ params, body }, _req, res) => {
      res.json(await ouvrages.modifier(params.id, body));
    }),
  );

  routeur.delete(
    "/:id",
    bibliothecaire,
    valider({ params: paramsId }, async ({ params }, _req, res) => {
      await serviceOuvrages.supprimer(params.id);
      res.status(204).end();
    }),
  );

  return routeur;
}
