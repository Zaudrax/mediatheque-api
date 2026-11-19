import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { type ApiDeTest, appeler, demarrer, fermerBase } from "./aide.ts";

let api: ApiDeTest;

before(async () => {
  api = await demarrer();
});
after(async () => {
  await api.fermer();
  await fermerBase();
});

const METHODES = ["get", "post", "patch", "delete"] as const;

describe("Documentation OpenAPI", () => {
  test("/api/docs.json renvoie une spécification OpenAPI 3.1 valide (200)", async () => {
    const { statut, corps, entetes } = await appeler(api.base, "/api/docs.json");
    assert.equal(statut, 200);
    assert.match(entetes.get("content-type") ?? "", /application\/json/);
    assert.equal(corps.openapi, "3.1.0");
    assert.ok(corps.info.title);
    assert.deepEqual(corps.components.securitySchemes.bearerAuth, {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  test("chaque route de l'API est documentée, avec ses erreurs et sa sécurité", async () => {
    const { corps } = await appeler(api.base, "/api/docs.json");
    const attendues = [
      "get /sante",
      "post /api/auth/inscription",
      "post /api/auth/connexion",
      "post /api/auth/rafraichir",
      "post /api/auth/deconnexion",
      "get /api/ouvrages",
      "post /api/ouvrages",
      "get /api/ouvrages/{id}",
      "patch /api/ouvrages/{id}",
      "delete /api/ouvrages/{id}",
      "get /api/emprunts",
      "post /api/emprunts",
      "get /api/emprunts/{id}",
      "patch /api/emprunts/{id}",
      "delete /api/emprunts/{id}",
      "post /api/emprunts/{id}/retour",
      "get /api/reservations",
      "post /api/reservations",
      "get /api/reservations/{id}",
      "delete /api/reservations/{id}",
      "post /api/assistant/flux",
      "delete /api/assistant/memoire",
    ];
    const documentees = Object.entries(corps.paths as Record<string, Record<string, unknown>>).flatMap(
      ([chemin, operations]) => METHODES.filter((m) => m in operations).map((m) => `${m} ${chemin}`),
    );
    assert.deepEqual(documentees.sort(), attendues.sort());

    for (const [chemin, operations] of Object.entries(corps.paths as Record<string, Record<string, any>>)) {
      for (const methode of METHODES) {
        const operation = operations[methode];
        if (!operation) continue;
        const codes = Object.keys(operation.responses);
        assert.ok(codes.some((c) => c.startsWith("2")), `${methode} ${chemin} : réponse de succès`);
        const publique = chemin === "/sante" || (chemin.startsWith("/api/auth/") && chemin !== "/api/auth/deconnexion");
        if (!publique) {
          assert.deepEqual(operation.security, [{ bearerAuth: [] }], `${methode} ${chemin} : bearerAuth`);
          assert.ok(codes.includes("401"), `${methode} ${chemin} : 401 documenté`);
        }
        if (chemin !== "/sante") {
          assert.ok(codes.some((c) => c.startsWith("4")), `${methode} ${chemin} : erreurs documentées`);
        }
      }
    }
  });

  test("les schémas de validation sont repris dans la documentation", async () => {
    const { corps } = await appeler(api.base, "/api/docs.json");
    const creerOuvrage = corps.components.schemas.CreerOuvrage;
    assert.deepEqual(creerOuvrage.required.sort(), ["annee", "auteur", "titre"]);
    assert.equal(creerOuvrage.properties.titre.maxLength, 150);
    assert.equal(creerOuvrage.properties.annee.minimum, 1450);
  });

  test("/api/docs sert Swagger UI (200, HTML)", async () => {
    const reponse = await fetch(`${api.base}/api/docs/`);
    assert.equal(reponse.status, 200);
    assert.match(reponse.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await reponse.text(), /swagger-ui/);
  });
});
