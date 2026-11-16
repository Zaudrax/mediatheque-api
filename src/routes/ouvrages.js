import { Router } from "express";
import { valider } from "../middlewares/valider.js";
import * as ouvrages from "../repositories/ouvrages.js";
import { paramsId, reponsePaginee } from "../schemas/commun.js";
import { creerOuvrage, listerOuvrages, modifierOuvrage } from "../schemas/ouvrages.js";

// Express 5 transmet automatiquement les rejets de promesse au gestionnaire d'erreurs.
export const routeurOuvrages = Router();

routeurOuvrages.get("/", valider({ query: listerOuvrages }), async (req, res) => {
  const { page, limite, disponible } = req.valide.query;
  const { donnees, total } = await ouvrages.lister({ page, limite, disponible });
  res.json(reponsePaginee({ donnees, total, page, limite }));
});

routeurOuvrages.get("/:id", valider({ params: paramsId }), async (req, res) => {
  res.json(await ouvrages.trouver(req.valide.params.id));
});

routeurOuvrages.post("/", valider({ body: creerOuvrage }), async (req, res) => {
  const ouvrage = await ouvrages.creer(req.valide.body);
  res.status(201).location(`${req.baseUrl}/${ouvrage.id}`).json(ouvrage);
});

routeurOuvrages.patch(
  "/:id",
  valider({ params: paramsId, body: modifierOuvrage }),
  async (req, res) => {
    res.json(await ouvrages.modifier(req.valide.params.id, req.valide.body));
  },
);

routeurOuvrages.delete("/:id", valider({ params: paramsId }), async (req, res) => {
  await ouvrages.supprimer(req.valide.params.id);
  res.status(204).end();
});
