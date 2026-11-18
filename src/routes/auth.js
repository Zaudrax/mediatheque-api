import { Router } from "express";
import { authentifier } from "../middlewares/authentifier.js";
import { valider } from "../middlewares/valider.js";
import { connexion, inscription, rafraichissement } from "../schemas/auth.js";
import * as auth from "../services/auth.js";

export function routeurAuth(config) {
  const routeur = Router();

  routeur.post("/inscription", valider({ body: inscription }), async (req, res) => {
    const utilisateur = await auth.inscrire(req.valide.body);
    res.status(201).json(utilisateur);
  });

  routeur.post("/connexion", valider({ body: connexion }), async (req, res) => {
    res.json(await auth.connecter(config.jwt, req.valide.body));
  });

  routeur.post("/rafraichir", valider({ body: rafraichissement }), async (req, res) => {
    res.json(await auth.rafraichir(config.jwt, req.valide.body.refreshToken));
  });

  routeur.post("/deconnexion", authentifier(config.jwt), async (req, res) => {
    await auth.deconnecter(req.utilisateur.id);
    res.status(204).end();
  });

  return routeur;
}
