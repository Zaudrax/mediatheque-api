import { Router } from "express";
import { estBibliothecaire, exigerRole } from "../middlewares/authentifier.js";
import { valider } from "../middlewares/valider.js";
import * as emprunts from "../repositories/emprunts.js";
import { paramsId, reponsePaginee } from "../schemas/commun.js";
import { creerEmprunt, listerEmprunts, modifierEmprunt } from "../schemas/emprunts.js";

/**
 * Monté derrière authentifier().
 * Un membre ne voit, ne crée, ne modifie et ne clôture que ses propres emprunts ;
 * un bibliothécaire accède à tous les emprunts et peut seul en supprimer.
 */
export const routeurEmprunts = Router();

const portee = (utilisateur) =>
  estBibliothecaire(utilisateur) ? {} : { emprunteurId: utilisateur.id };

routeurEmprunts.get("/", valider({ query: listerEmprunts }), async (req, res) => {
  const { page, limite } = req.valide.query;
  const { donnees, total } = await emprunts.lister(req.valide.query, portee(req.utilisateur));
  res.json(reponsePaginee({ donnees, total, page, limite }));
});

routeurEmprunts.get("/:id", valider({ params: paramsId }), async (req, res) => {
  res.json(await emprunts.trouver(req.valide.params.id, portee(req.utilisateur)));
});

routeurEmprunts.post("/", valider({ body: creerEmprunt }), async (req, res) => {
  const corps = req.valide.body;
  // Un membre emprunte toujours pour lui-même ; un bibliothécaire peut emprunter au nom d'un membre.
  const emprunteurId = estBibliothecaire(req.utilisateur)
    ? (corps.emprunteurId ?? req.utilisateur.id)
    : req.utilisateur.id;
  const emprunt = await emprunts.creer({ ...corps, emprunteurId });
  res.status(201).location(`${req.baseUrl}/${emprunt.id}`).json(emprunt);
});

routeurEmprunts.post("/:id/retour", valider({ params: paramsId }), async (req, res) => {
  res.json(await emprunts.retourner(req.valide.params.id, portee(req.utilisateur)));
});

routeurEmprunts.patch(
  "/:id",
  valider({ params: paramsId, body: modifierEmprunt }),
  async (req, res) => {
    res.json(
      await emprunts.modifier(req.valide.params.id, req.valide.body, portee(req.utilisateur)),
    );
  },
);

routeurEmprunts.delete(
  "/:id",
  exigerRole("bibliothecaire"),
  valider({ params: paramsId }),
  async (req, res) => {
    await emprunts.supprimer(req.valide.params.id);
    res.status(204).end();
  },
);
