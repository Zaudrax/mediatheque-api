import { Router } from "express";
import { valider } from "../middlewares/valider.js";
import * as emprunts from "../repositories/emprunts.js";
import { paramsId, reponsePaginee } from "../schemas/commun.js";
import { creerEmprunt, listerEmprunts, modifierEmprunt } from "../schemas/emprunts.js";

export const routeurEmprunts = Router();

routeurEmprunts.get("/", valider({ query: listerEmprunts }), async (req, res) => {
  const { page, limite, rendu, ouvrageId } = req.valide.query;
  const { donnees, total } = await emprunts.lister({ page, limite, rendu, ouvrageId });
  res.json(reponsePaginee({ donnees, total, page, limite }));
});

routeurEmprunts.get("/:id", valider({ params: paramsId }), async (req, res) => {
  res.json(await emprunts.trouver(req.valide.params.id));
});

routeurEmprunts.post("/", valider({ body: creerEmprunt }), async (req, res) => {
  const emprunt = await emprunts.creer(req.valide.body);
  res.status(201).location(`${req.baseUrl}/${emprunt.id}`).json(emprunt);
});

routeurEmprunts.post("/:id/retour", valider({ params: paramsId }), async (req, res) => {
  res.json(await emprunts.retourner(req.valide.params.id));
});

routeurEmprunts.patch(
  "/:id",
  valider({ params: paramsId, body: modifierEmprunt }),
  async (req, res) => {
    res.json(await emprunts.modifier(req.valide.params.id, req.valide.body));
  },
);

routeurEmprunts.delete("/:id", valider({ params: paramsId }), async (req, res) => {
  await emprunts.supprimer(req.valide.params.id);
  res.status(204).end();
});
