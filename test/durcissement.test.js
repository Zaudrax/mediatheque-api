import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { appeler, comptes, demarrer, fermerBase, reinitialiserBase } from "./aide.js";

let api;

before(async () => {
  await reinitialiserBase();
  api = await demarrer();
});
after(async () => {
  await api.fermer();
  await fermerBase();
});

describe("En-têtes et CORS", () => {
  test("helmet est actif et la technologie n'est pas annoncée", async () => {
    const { entetes } = await appeler(api.base, "/sante");
    assert.ok(entetes.get("content-security-policy"));
    assert.equal(entetes.get("x-content-type-options"), "nosniff");
    assert.ok(entetes.get("strict-transport-security"));
    assert.equal(entetes.get("x-powered-by"), null);
  });

  test("une origine déclarée dans CORS_ORIGINS est autorisée", async () => {
    const origine = process.env.CORS_ORIGINS.split(",")[0].trim();
    const { statut, entetes } = await appeler(api.base, "/sante", { entetes: { Origin: origine } });
    assert.equal(statut, 200);
    assert.equal(entetes.get("access-control-allow-origin"), origine);
  });

  test("une origine non déclarée est refusée (403)", async () => {
    const { statut, entetes } = await appeler(api.base, "/sante", {
      entetes: { Origin: "https://site-inconnu.example" },
    });
    assert.equal(statut, 403);
    assert.equal(entetes.get("access-control-allow-origin"), null);
  });
});

describe("Corps et erreurs", () => {
  test("un corps JSON de plus de 100 Ko est refusé (413)", async () => {
    const { statut } = await appeler(api.base, "/api/auth/connexion", {
      methode: "POST",
      corps: { email: "a@example.net", motDePasse: "x".repeat(110 * 1024) },
    });
    assert.equal(statut, 413);
  });

  test("aucune pile d'exécution dans les réponses d'erreur", async () => {
    const reponses = await Promise.all([
      appeler(api.base, "/api/auth/connexion", { methode: "POST", corps: "{ mal formé" }),
      appeler(api.base, "/api/ouvrages", { jeton: "abc" }),
      appeler(api.base, "/route/inconnue"),
    ]);
    assert.deepEqual(
      reponses.map((r) => r.statut),
      [400, 401, 404],
    );
    for (const { corps } of reponses) {
      assert.doesNotMatch(JSON.stringify(corps), /at .+\.js|node_modules|stack/i);
    }
  });
});

describe("Limitation de débit", () => {
  test("la onzième tentative sur /api/auth en un quart d'heure reçoit 429", async () => {
    // Application dédiée avec la limite réelle (10 / 15 min) et un compteur neuf.
    const limitee = await demarrer({
      limites: {
        auth: { max: 10, fenetreMs: 15 * 60 * 1000 },
        generale: { max: 300, fenetreMs: 60 * 1000 },
      },
    });
    try {
      const statuts = [];
      for (let i = 0; i < 11; i++) {
        const { statut } = await appeler(limitee.base, "/api/auth/connexion", {
          methode: "POST",
          corps: { email: comptes.alice.email, motDePasse: "mauvais-mot-de-passe" },
        });
        statuts.push(statut);
      }
      assert.deepEqual(statuts.slice(0, 10), Array(10).fill(401));
      assert.equal(statuts[10], 429);
    } finally {
      await limitee.fermer();
    }
  });
});
