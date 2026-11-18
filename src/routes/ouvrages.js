import { Router } from "express";
import { estBibliothecaire, exigerRole } from "../middlewares/authentifier.js";
import { valider } from "../middlewares/valider.js";
import * as ouvrages from "../repositories/ouvrages.js";
import { paramsId, reponsePaginee } from "../schemas/commun.js";
import { creerOuvrage, listerOuvrages, modifierOuvrage } from "../schemas/ouvrages.js";

// Express 5 transmet automatiquement les rejets de promesse au gestionnaire d'erreurs.
// Monté derrière authentifier() : lecture pour tout utilisateur connecté,
// écriture réservée aux bibliothécaires.
export const routeurOuvrages = Router();

const bibliothecaire = exigerRole("bibliothecaire");

routeurOuvrages.get("/", valider({ query: listerOuvrages }), async (req, res) => {
  const { page, limite, disponible } = req.valide.query;
  const { donnees, total } = await ouvrages.lister({ page, limite, disponible });
  res.json(reponsePaginee({ donnees, total, page, limite }));
});

routeurOuvrages.get("/:id", valider({ params: paramsId }), async (req, res) => {
  // Un membre ne voit que ses propres emprunts en cours sur cet ouvrage.
  const portee = estBibliothecaire(req.utilisateur) ? {} : { emprunteurId: req.utilisateur.id };
  res.json(await ouvrages.trouver(req.valide.params.id, portee));
});

routeurOuvrages.post("/", bibliothecaire, valider({ body: creerOuvrage }), async (req, res) => {
  const ouvrage = await ouvrages.creer(req.valide.body);
  res.status(201).location(`${req.baseUrl}/${ouvrage.id}`).json(ouvrage);
});

routeurOuvrages.patch(
  "/:id",
  bibliothecaire,
  valider({ params: paramsId, body: modifierOuvrage }),
  async (req, res) => {
    res.json(await ouvrages.modifier(req.valide.params.id, req.valide.body));
  },
);

routeurOuvrages.delete("/:id", bibliothecaire, valider({ params: paramsId }), async (req, res) => {
  await ouvrages.supprimer(req.valide.params.id);
  res.status(204).end();
});
