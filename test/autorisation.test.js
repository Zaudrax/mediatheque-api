import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { appeler, comptes, connecter, demarrer, fermerBase, reinitialiserBase } from "./aide.js";

let api;
let jetons;

before(async () => {
  api = await demarrer();
});
beforeEach(async () => {
  await reinitialiserBase();
  const [bibliothecaire, alice, bruno] = await Promise.all([
    connecter(api.base, comptes.bibliothecaire.email),
    connecter(api.base, comptes.alice.email),
    connecter(api.base, comptes.bruno.email),
  ]);
  jetons = {
    bibliothecaire: bibliothecaire.accessToken,
    alice: alice.accessToken,
    bruno: bruno.accessToken,
  };
});
after(async () => {
  await api.fermer();
  await fermerBase();
});

const dansDeuxSemaines = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

describe("Authentification requise", () => {
  test("sans jeton : 401 avec l'en-tête WWW-Authenticate", async () => {
    const { statut, entetes } = await appeler(api.base, "/api/ouvrages");
    assert.equal(statut, 401);
    assert.match(entetes.get("www-authenticate"), /^Bearer/);
  });

  test("jeton falsifié ou mal formé : 401, jamais 500", async () => {
    const signatureBidon = jetons.alice.split(".").slice(0, 2).join(".") + ".AAAA";
    for (const jeton of ["n-importe-quoi", `${jetons.alice}x`, signatureBidon]) {
      const { statut } = await appeler(api.base, "/api/emprunts", { jeton });
      assert.equal(statut, 401, `jeton ${jeton.slice(0, 20)}…`);
    }
  });
});

describe("Rôles sur le catalogue", () => {
  test("un membre lit le catalogue (200)", async () => {
    const { statut, corps } = await appeler(api.base, "/api/ouvrages", { jeton: jetons.alice });
    assert.equal(statut, 200);
    assert.equal(corps.pagination.total, 3);
  });

  test("un membre ne peut pas modifier le catalogue (403)", async () => {
    const ouvrage = { titre: "Nana", auteur: "Émile Zola", annee: 1880 };
    const creation = await appeler(api.base, "/api/ouvrages", {
      methode: "POST",
      jeton: jetons.alice,
      corps: ouvrage,
    });
    const modification = await appeler(api.base, "/api/ouvrages/3", {
      methode: "PATCH",
      jeton: jetons.alice,
      corps: { annee: 1900 },
    });
    const suppression = await appeler(api.base, "/api/ouvrages/3", {
      methode: "DELETE",
      jeton: jetons.alice,
    });
    assert.deepEqual([creation.statut, modification.statut, suppression.statut], [403, 403, 403]);
  });

  test("un bibliothécaire gère le catalogue (201, 200, 204)", async () => {
    const creation = await appeler(api.base, "/api/ouvrages", {
      methode: "POST",
      jeton: jetons.bibliothecaire,
      corps: { titre: "Nana", auteur: "Émile Zola", annee: 1880 },
    });
    assert.equal(creation.statut, 201);
    const id = creation.corps.id;
    const modification = await appeler(api.base, `/api/ouvrages/${id}`, {
      methode: "PATCH",
      jeton: jetons.bibliothecaire,
      corps: { annee: 1881 },
    });
    assert.equal(modification.statut, 200);
    const suppression = await appeler(api.base, `/api/ouvrages/${id}`, {
      methode: "DELETE",
      jeton: jetons.bibliothecaire,
    });
    assert.equal(suppression.statut, 204);
  });
});

describe("Propriété des emprunts", () => {
  test("un membre ne liste que ses propres emprunts, même en filtrant sur un autre", async () => {
    const liste = await appeler(api.base, "/api/emprunts?emprunteurId=3", { jeton: jetons.alice });
    assert.equal(liste.statut, 200);
    assert.equal(liste.corps.pagination.total, 1);
    assert.ok(liste.corps.donnees.every((e) => e.emprunteurId === comptes.alice.id));
  });

  test("un membre ne voit ni ne clôture l'emprunt d'un autre (404)", async () => {
    // L'emprunt 2 appartient à Bruno.
    const lecture = await appeler(api.base, "/api/emprunts/2", { jeton: jetons.alice });
    const retour = await appeler(api.base, "/api/emprunts/2/retour", {
      methode: "POST",
      jeton: jetons.alice,
    });
    const modification = await appeler(api.base, "/api/emprunts/2", {
      methode: "PATCH",
      jeton: jetons.alice,
      corps: { dateRetourPrevue: dansDeuxSemaines() },
    });
    assert.deepEqual([lecture.statut, retour.statut, modification.statut], [404, 404, 404]);

    // Le détail d'un ouvrage ne révèle pas non plus l'emprunt de Bruno.
    const ouvrage = await appeler(api.base, "/api/ouvrages/2", { jeton: jetons.alice });
    assert.deepEqual(ouvrage.corps.emprunts, []);
  });

  test("un membre emprunte toujours pour lui-même, quel que soit l'emprunteurId envoyé", async () => {
    const { statut, corps } = await appeler(api.base, "/api/emprunts", {
      methode: "POST",
      jeton: jetons.alice,
      corps: { ouvrageId: 3, emprunteurId: comptes.bruno.id, dateRetourPrevue: dansDeuxSemaines() },
    });
    assert.equal(statut, 201);
    assert.equal(corps.emprunteurId, comptes.alice.id);
  });

  test("le PATCH ne permet pas de changer le propriétaire d'un emprunt", async () => {
    const { statut, corps } = await appeler(api.base, "/api/emprunts/1", {
      methode: "PATCH",
      jeton: jetons.alice,
      corps: { emprunteurId: comptes.bruno.id, dateRetourPrevue: dansDeuxSemaines() },
    });
    assert.equal(statut, 200);
    assert.equal(corps.emprunteurId, comptes.alice.id);
  });

  test("un membre clôture son propre emprunt (200)", async () => {
    const { statut, corps } = await appeler(api.base, "/api/emprunts/1/retour", {
      methode: "POST",
      jeton: jetons.alice,
    });
    assert.equal(statut, 200);
    assert.equal(corps.rendu, true);
  });

  test("un bibliothécaire voit et clôture tous les emprunts", async () => {
    const liste = await appeler(api.base, "/api/emprunts", { jeton: jetons.bibliothecaire });
    assert.equal(liste.corps.pagination.total, 2);

    const retour = await appeler(api.base, "/api/emprunts/2/retour", {
      methode: "POST",
      jeton: jetons.bibliothecaire,
    });
    assert.equal(retour.statut, 200);
  });

  test("seul un bibliothécaire supprime un emprunt", async () => {
    const parMembre = await appeler(api.base, "/api/emprunts/1", {
      methode: "DELETE",
      jeton: jetons.alice,
    });
    assert.equal(parMembre.statut, 403);
    const parBibliothecaire = await appeler(api.base, "/api/emprunts/1", {
      methode: "DELETE",
      jeton: jetons.bibliothecaire,
    });
    assert.equal(parBibliothecaire.statut, 204);
  });
});
