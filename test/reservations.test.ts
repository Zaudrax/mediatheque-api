import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  type ApiDeTest,
  appeler,
  comptes,
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

/** Bruno réserve « Germinal » (ouvrage 1), emprunté par Alice. */
const reserverGerminalPourBruno = () =>
  appeler(api.base, "/api/reservations", { methode: "POST", jeton: jetons.bruno, corps: { ouvrageId: 1 } });

describe("Règles de réservation", () => {
  test("un membre réserve un ouvrage indisponible (201, statut active)", async () => {
    const { statut, corps, entetes } = await reserverGerminalPourBruno();
    assert.equal(statut, 201);
    assert.equal(corps.statut, "active");
    assert.equal(corps.membreId, comptes.bruno.id);
    assert.equal(corps.active, undefined, "le champ technique n'est pas exposé");
    assert.match(entetes.get("location") ?? "", /\/api\/reservations\/\d+$/);
  });

  test("réserver un ouvrage disponible est refusé (409)", async () => {
    const { statut } = await appeler(api.base, "/api/reservations", {
      methode: "POST",
      jeton: jetons.bruno,
      corps: { ouvrageId: 3 },
    });
    assert.equal(statut, 409);
  });

  test("une seule réservation active par membre et par ouvrage (409)", async () => {
    assert.equal((await reserverGerminalPourBruno()).statut, 201);
    assert.equal((await reserverGerminalPourBruno()).statut, 409);
  });

  test("on ne réserve pas un ouvrage qu'on emprunte déjà (409), ni un ouvrage inconnu (404)", async () => {
    const dejaEmprunte = await appeler(api.base, "/api/reservations", {
      methode: "POST",
      jeton: jetons.alice,
      corps: { ouvrageId: 1 },
    });
    const inconnu = await appeler(api.base, "/api/reservations", {
      methode: "POST",
      jeton: jetons.alice,
      corps: { ouvrageId: 999 },
    });
    assert.deepEqual([dejaEmprunte.statut, inconnu.statut], [409, 404]);
  });

  test("au retour, la réservation la plus ancienne devient un emprunt, dans la même transaction", async () => {
    // Bruno réserve en premier, puis le bibliothécaire réserve aussi (file d'attente).
    const premiere = await reserverGerminalPourBruno();
    await appeler(api.base, "/api/reservations", {
      methode: "POST",
      jeton: jetons.bibliothecaire,
      corps: { ouvrageId: 1 },
    });

    const retour = await appeler(api.base, "/api/emprunts/1/retour", { methode: "POST", jeton: jetons.alice });
    assert.equal(retour.statut, 200);
    assert.equal(retour.corps.rendu, true);
    assert.ok(retour.corps.empruntSuivantId);

    const reservation = await appeler(api.base, `/api/reservations/${premiere.corps.id}`, { jeton: jetons.bruno });
    assert.equal(reservation.corps.statut, "honoree");
    assert.equal(reservation.corps.empruntId, retour.corps.empruntSuivantId);

    const emprunt = await appeler(api.base, `/api/emprunts/${retour.corps.empruntSuivantId}`, { jeton: jetons.bruno });
    assert.equal(emprunt.statut, 200);
    assert.equal(emprunt.corps.emprunteurId, comptes.bruno.id);
    assert.equal(emprunt.corps.rendu, false);

    // L'ouvrage reste indisponible : il est passé de main en main.
    const ouvrage = await appeler(api.base, "/api/ouvrages/1", { jeton: jetons.bibliothecaire });
    assert.equal(ouvrage.corps.disponible, false);

    // La seconde réservation reste en attente.
    const enAttente = await appeler(api.base, "/api/reservations?statut=active", { jeton: jetons.bibliothecaire });
    assert.equal(enAttente.corps.pagination.total, 1);
  });

  test("sans réservation, le retour rend l'ouvrage disponible", async () => {
    const retour = await appeler(api.base, "/api/emprunts/1/retour", { methode: "POST", jeton: jetons.alice });
    assert.equal(retour.corps.empruntSuivantId, null);
    const ouvrage = await appeler(api.base, "/api/ouvrages/1", { jeton: jetons.alice });
    assert.equal(ouvrage.corps.disponible, true);
  });

  test("un membre annule sa réservation (204) ; une seconde annulation donne 409", async () => {
    const { corps } = await reserverGerminalPourBruno();
    const annulation = await appeler(api.base, `/api/reservations/${corps.id}`, {
      methode: "DELETE",
      jeton: jetons.bruno,
    });
    assert.equal(annulation.statut, 204);
    const detail = await appeler(api.base, `/api/reservations/${corps.id}`, { jeton: jetons.bruno });
    assert.equal(detail.corps.statut, "annulee");
    const encore = await appeler(api.base, `/api/reservations/${corps.id}`, { methode: "DELETE", jeton: jetons.bruno });
    assert.equal(encore.statut, 409);
    // Après annulation, il peut réserver de nouveau.
    assert.equal((await reserverGerminalPourBruno()).statut, 201);
  });

  test("une réservation annulée n'est pas servie au retour", async () => {
    const { corps } = await reserverGerminalPourBruno();
    await appeler(api.base, `/api/reservations/${corps.id}`, { methode: "DELETE", jeton: jetons.bruno });
    const retour = await appeler(api.base, "/api/emprunts/1/retour", { methode: "POST", jeton: jetons.alice });
    assert.equal(retour.corps.empruntSuivantId, null);
  });

  test("entrées invalides : 400 avec les champs fautifs", async () => {
    const { statut, corps } = await appeler(api.base, "/api/reservations?statut=perdue", { jeton: jetons.alice });
    assert.equal(statut, 400);
    assert.equal(corps.details[0].champ, "query.statut");
  });
});

describe("Droits sur les réservations", () => {
  test("un membre ne voit ni n'annule la réservation d'un autre (404)", async () => {
    const { corps } = await reserverGerminalPourBruno();
    const lecture = await appeler(api.base, `/api/reservations/${corps.id}`, { jeton: jetons.alice });
    const annulation = await appeler(api.base, `/api/reservations/${corps.id}`, {
      methode: "DELETE",
      jeton: jetons.alice,
    });
    const liste = await appeler(api.base, `/api/reservations?membreId=${comptes.bruno.id}`, { jeton: jetons.alice });
    assert.deepEqual([lecture.statut, annulation.statut], [404, 404]);
    assert.equal(liste.corps.pagination.total, 0);
  });

  test("un membre réserve toujours pour lui-même, quel que soit le membreId envoyé", async () => {
    const { corps } = await appeler(api.base, "/api/reservations", {
      methode: "POST",
      jeton: jetons.bruno,
      corps: { ouvrageId: 1, membreId: comptes.alice.id },
    });
    assert.equal(corps.membreId, comptes.bruno.id);
  });

  test("un bibliothécaire voit toutes les réservations et réserve au nom d'un membre", async () => {
    await reserverGerminalPourBruno();
    const pourAlice = await appeler(api.base, "/api/reservations", {
      methode: "POST",
      jeton: jetons.bibliothecaire,
      corps: { ouvrageId: 2, membreId: comptes.alice.id },
    });
    assert.equal(pourAlice.statut, 201);
    assert.equal(pourAlice.corps.membreId, comptes.alice.id);
    const liste = await appeler(api.base, "/api/reservations", { jeton: jetons.bibliothecaire });
    assert.equal(liste.corps.pagination.total, 2);
  });

  test("sans jeton : 401", async () => {
    const { statut } = await appeler(api.base, "/api/reservations");
    assert.equal(statut, 401);
  });

  test("un emprunt direct d'un ouvrage réservé donne 409 : il faut attendre son tour", async () => {
    await reserverGerminalPourBruno();
    const { statut } = await appeler(api.base, "/api/emprunts", {
      methode: "POST",
      jeton: jetons.bibliothecaire,
      corps: { ouvrageId: 1, dateRetourPrevue: dansDeuxSemaines() },
    });
    assert.equal(statut, 409);
  });
});
