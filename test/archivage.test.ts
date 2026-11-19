import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  type ApiDeTest,
  appeler,
  connecterTous,
  dansDeuxSemaines,
  demarrer,
  fermerBase,
  reinitialiserBase,
} from "./aide.ts";

let api: ApiDeTest;
let jetons: Awaited<ReturnType<typeof connecterTous>>;

before(async () => {
  api = await demarrer();
});
beforeEach(async () => {
  await reinitialiserBase();
  jetons = await connecterTous(api.base);
});
after(async () => {
  await api.fermer();
  await fermerBase();
});

const supprimerOuvrage = (id: number) =>
  appeler(api.base, `/api/ouvrages/${id}`, { methode: "DELETE", jeton: jetons.bibliothecaire });

/** Alice rend « Germinal » (ouvrage 1) : l'ouvrage a désormais un historique. */
const aliceRendGerminal = () =>
  appeler(api.base, "/api/emprunts/1/retour", { methode: "POST", jeton: jetons.alice });

describe("Suppression et archivage des ouvrages", () => {
  test("un ouvrage emprunté ne peut pas être retiré du catalogue (409)", async () => {
    assert.equal((await supprimerOuvrage(1)).statut, 409);
  });

  test("un ouvrage sans aucun emprunt ni réservation est supprimé définitivement (204)", async () => {
    assert.equal((await supprimerOuvrage(3)).statut, 204);
    const lecture = await appeler(api.base, "/api/ouvrages/3", { jeton: jetons.bibliothecaire });
    assert.equal(lecture.statut, 404);
  });

  test("un ouvrage avec un historique est archivé : retiré du catalogue, historique conservé", async () => {
    await aliceRendGerminal();
    assert.equal((await supprimerOuvrage(1)).statut, 204);

    // Il n'apparaît plus dans le catalogue…
    const catalogue = await appeler(api.base, "/api/ouvrages", { jeton: jetons.alice });
    assert.ok(catalogue.corps.donnees.every((o: { id: number }) => o.id !== 1));
    assert.equal(catalogue.corps.pagination.total, 2);
    assert.equal((await appeler(api.base, "/api/ouvrages/1", { jeton: jetons.alice })).statut, 404);

    // … mais l'historique de l'emprunt reste consultable, avec le titre de l'ouvrage.
    const historique = await appeler(api.base, "/api/emprunts/1", { jeton: jetons.alice });
    assert.equal(historique.statut, 200);
    assert.equal(historique.corps.ouvrage.titre, "Germinal");
  });

  test("un ouvrage archivé ne peut être ni emprunté, ni réservé, ni modifié, ni archivé deux fois (404)", async () => {
    await aliceRendGerminal();
    await supprimerOuvrage(1);

    const emprunt = await appeler(api.base, "/api/emprunts", {
      methode: "POST",
      jeton: jetons.alice,
      corps: { ouvrageId: 1, dateRetourPrevue: dansDeuxSemaines() },
    });
    const reservation = await appeler(api.base, "/api/reservations", {
      methode: "POST",
      jeton: jetons.bruno,
      corps: { ouvrageId: 1 },
    });
    const modification = await appeler(api.base, "/api/ouvrages/1", {
      methode: "PATCH",
      jeton: jetons.bibliothecaire,
      corps: { annee: 1886 },
    });
    const secondeSuppression = await supprimerOuvrage(1);
    assert.deepEqual(
      [emprunt.statut, reservation.statut, modification.statut, secondeSuppression.statut],
      [404, 404, 404, 404],
    );
  });

  test("un historique fait uniquement de réservations suffit à archiver l'ouvrage", async () => {
    // Bruno réserve « Germinal » puis annule ; l'emprunt d'Alice est ensuite supprimé :
    // il ne reste qu'une réservation annulée, que la clé étrangère protège.
    const { corps } = await appeler(api.base, "/api/reservations", {
      methode: "POST",
      jeton: jetons.bruno,
      corps: { ouvrageId: 1 },
    });
    await appeler(api.base, `/api/reservations/${corps.id}`, { methode: "DELETE", jeton: jetons.bruno });
    await appeler(api.base, "/api/emprunts/1", { methode: "DELETE", jeton: jetons.bibliothecaire });

    assert.equal((await supprimerOuvrage(1)).statut, 204);
    assert.equal((await appeler(api.base, "/api/ouvrages/1", { jeton: jetons.bruno })).statut, 404);
    const historique = await appeler(api.base, `/api/reservations/${corps.id}`, { jeton: jetons.bruno });
    assert.equal(historique.statut, 200);
    assert.equal(historique.corps.statut, "annulee");
  });
});
