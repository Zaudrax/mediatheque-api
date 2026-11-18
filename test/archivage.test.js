import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { appeler, comptes, connecter, demarrer, fermerBase, reinitialiserBase } from "./aide.js";

let api;
let biblio;
let alice;

before(async () => {
  api = await demarrer();
});
beforeEach(async () => {
  await reinitialiserBase();
  [biblio, alice] = await Promise.all([
    connecter(api.base, comptes.bibliothecaire.email).then((c) => c.accessToken),
    connecter(api.base, comptes.alice.email).then((c) => c.accessToken),
  ]);
});
after(async () => {
  await api.fermer();
  await fermerBase();
});

const dansDeuxSemaines = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

describe("Suppression et archivage des ouvrages", () => {
  test("un ouvrage emprunté ne peut pas être retiré du catalogue (409)", async () => {
    const { statut } = await appeler(api.base, "/api/ouvrages/1", { methode: "DELETE", jeton: biblio });
    assert.equal(statut, 409);
  });

  test("un ouvrage sans aucun emprunt est supprimé définitivement (204)", async () => {
    const suppression = await appeler(api.base, "/api/ouvrages/3", { methode: "DELETE", jeton: biblio });
    assert.equal(suppression.statut, 204);
    const lecture = await appeler(api.base, "/api/ouvrages/3", { jeton: biblio });
    assert.equal(lecture.statut, 404);
  });

  test("un ouvrage avec un historique est archivé : retiré du catalogue, historique conservé", async () => {
    // Alice rend « Germinal » (ouvrage 1) : l'ouvrage a désormais un historique.
    await appeler(api.base, "/api/emprunts/1/retour", { methode: "POST", jeton: alice });

    const suppression = await appeler(api.base, "/api/ouvrages/1", { methode: "DELETE", jeton: biblio });
    assert.equal(suppression.statut, 204);

    // Il n'apparaît plus dans le catalogue…
    const catalogue = await appeler(api.base, "/api/ouvrages", { jeton: alice });
    assert.ok(catalogue.corps.donnees.every((o) => o.id !== 1));
    assert.equal(catalogue.corps.pagination.total, 2);
    assert.equal((await appeler(api.base, "/api/ouvrages/1", { jeton: alice })).statut, 404);

    // … mais l'historique de l'emprunt reste consultable, avec le titre de l'ouvrage.
    const historique = await appeler(api.base, "/api/emprunts/1", { jeton: alice });
    assert.equal(historique.statut, 200);
    assert.equal(historique.corps.ouvrage.titre, "Germinal");
  });

  test("un ouvrage archivé ne peut être ni emprunté, ni modifié, ni archivé deux fois (404)", async () => {
    await appeler(api.base, "/api/emprunts/1/retour", { methode: "POST", jeton: alice });
    await appeler(api.base, "/api/ouvrages/1", { methode: "DELETE", jeton: biblio });

    const emprunt = await appeler(api.base, "/api/emprunts", {
      methode: "POST",
      jeton: alice,
      corps: { ouvrageId: 1, dateRetourPrevue: dansDeuxSemaines() },
    });
    const modification = await appeler(api.base, "/api/ouvrages/1", {
      methode: "PATCH",
      jeton: biblio,
      corps: { annee: 1886 },
    });
    const secondeSuppression = await appeler(api.base, "/api/ouvrages/1", { methode: "DELETE", jeton: biblio });
    assert.deepEqual([emprunt.statut, modification.statut, secondeSuppression.statut], [404, 404, 404]);
  });
});
