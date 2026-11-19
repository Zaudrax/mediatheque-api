import { Router } from "express";
import type { Config } from "../config.ts";
import { authentifier, utilisateurDe } from "../middlewares/authentifier.ts";
import { valider } from "../middlewares/valider.ts";
import { connexion, inscription, rafraichissement } from "../schemas/auth.ts";
import * as auth from "../services/auth.ts";

export function routeurAuth(config: Config): Router {
  const routeur = Router();

  routeur.post(
    "/inscription",
    valider({ body: inscription }, async ({ body }, _req, res) => {
      res.status(201).json(await auth.inscrire(body));
    }),
  );

  routeur.post(
    "/connexion",
    valider({ body: connexion }, async ({ body }, _req, res) => {
      res.json(await auth.connecter(config.jwt, body));
    }),
  );

  routeur.post(
    "/rafraichir",
    valider({ body: rafraichissement }, async ({ body }, _req, res) => {
      res.json(await auth.rafraichir(config.jwt, body.refreshToken));
    }),
  );

  routeur.post("/deconnexion", authentifier(config.jwt), async (req, res) => {
    await auth.deconnecter(utilisateurDe(req).id);
    res.status(204).end();
  });

  return routeur;
}
