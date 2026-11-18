import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { appeler, comptes, connecter, demarrer, fermerBase, MOT_DE_PASSE, reinitialiserBase } from "./aide.js";

let api;

before(async () => {
  api = await demarrer();
});
beforeEach(reinitialiserBase);
after(async () => {
  await api.fermer();
  await fermerBase();
});

describe("Inscription", () => {
  test("crée un membre (201) sans jamais renvoyer le mot de passe ni son hachage", async () => {
    const { statut, corps } = await appeler(api.base, "/api/auth/inscription", {
      methode: "POST",
      corps: { email: "Nouveau@Example.net", motDePasse: "Un-mot-de-passe-solide" },
    });
    assert.equal(statut, 201);
    assert.equal(corps.email, "nouveau@example.net");
    assert.equal(corps.role, "membre");
    assert.equal(corps.motDePasse, undefined);
    assert.equal(corps.motDePasseHache, undefined);
    assert.doesNotMatch(JSON.stringify(corps), /Un-mot-de-passe-solide|\$2[aby]\$/);
  });

  test("ignore un rôle envoyé par le client : impossible de s'inscrire bibliothécaire", async () => {
    const { statut, corps } = await appeler(api.base, "/api/auth/inscription", {
      methode: "POST",
      corps: { email: "malin@example.net", motDePasse: "Un-mot-de-passe-solide", role: "bibliothecaire" },
    });
    assert.equal(statut, 201);
    assert.equal(corps.role, "membre");
  });

  test("refuse un e-mail déjà inscrit (409)", async () => {
    const { statut } = await appeler(api.base, "/api/auth/inscription", {
      methode: "POST",
      corps: { email: comptes.alice.email, motDePasse: "Un-mot-de-passe-solide" },
    });
    assert.equal(statut, 409);
  });

  test("refuse un e-mail invalide et un mot de passe trop court (400, champs nommés)", async () => {
    const { statut, corps } = await appeler(api.base, "/api/auth/inscription", {
      methode: "POST",
      corps: { email: "pas-un-email", motDePasse: "court" },
    });
    assert.equal(statut, 400);
    const champs = corps.details.map((d) => d.champ).sort();
    assert.deepEqual(champs, ["body.email", "body.motDePasse"]);
  });
});

describe("Connexion", () => {
  test("réussie : renvoie un access token et un refresh token (200)", async () => {
    const corps = await connecter(api.base, comptes.alice.email);
    assert.equal(corps.tokenType, "Bearer");
    assert.match(corps.accessToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.match(corps.refreshToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.deepEqual(corps.utilisateur, { id: 2, email: comptes.alice.email, role: "membre" });

    // L'access token expire en 15 minutes au plus.
    const charge = JSON.parse(Buffer.from(corps.accessToken.split(".")[1], "base64url"));
    assert.ok(charge.exp - charge.iat <= 15 * 60);
    assert.equal(charge.motDePasseHache, undefined);
  });

  test("échouée : même 401 et même message, que le compte existe ou non", async () => {
    const mauvaisMotDePasse = await appeler(api.base, "/api/auth/connexion", {
      methode: "POST",
      corps: { email: comptes.alice.email, motDePasse: "pas-le-bon" },
    });
    const compteInconnu = await appeler(api.base, "/api/auth/connexion", {
      methode: "POST",
      corps: { email: "inconnu@example.net", motDePasse: MOT_DE_PASSE },
    });
    assert.equal(mauvaisMotDePasse.statut, 401);
    assert.equal(compteInconnu.statut, 401);
    assert.deepEqual(mauvaisMotDePasse.corps, compteInconnu.corps);
  });
});

describe("Rafraîchissement et déconnexion", () => {
  test("le refresh token donne une nouvelle paire et ne sert qu'une fois", async () => {
    const { refreshToken } = await connecter(api.base, comptes.alice.email);

    const premier = await appeler(api.base, "/api/auth/rafraichir", {
      methode: "POST",
      corps: { refreshToken },
    });
    assert.equal(premier.statut, 200);
    assert.ok(premier.corps.accessToken);
    assert.notEqual(premier.corps.refreshToken, refreshToken);

    // Le nouvel access token fonctionne.
    const lecture = await appeler(api.base, "/api/ouvrages", { jeton: premier.corps.accessToken });
    assert.equal(lecture.statut, 200);

    // Rejouer l'ancien refresh token est refusé…
    const rejeu = await appeler(api.base, "/api/auth/rafraichir", {
      methode: "POST",
      corps: { refreshToken },
    });
    assert.equal(rejeu.statut, 401);

    // … et révoque par précaution tous les jetons du compte, y compris le nouveau.
    const apresRejeu = await appeler(api.base, "/api/auth/rafraichir", {
      methode: "POST",
      corps: { refreshToken: premier.corps.refreshToken },
    });
    assert.equal(apresRejeu.statut, 401);
  });

  test("un refresh token falsifié donne 401, jamais 500", async () => {
    const { statut } = await appeler(api.base, "/api/auth/rafraichir", {
      methode: "POST",
      corps: { refreshToken: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature-bidon" },
    });
    assert.equal(statut, 401);
  });

  test("la déconnexion révoque les refresh tokens de l'utilisateur", async () => {
    const { accessToken, refreshToken } = await connecter(api.base, comptes.alice.email);

    const deconnexion = await appeler(api.base, "/api/auth/deconnexion", {
      methode: "POST",
      jeton: accessToken,
    });
    assert.equal(deconnexion.statut, 204);

    const { statut } = await appeler(api.base, "/api/auth/rafraichir", {
      methode: "POST",
      corps: { refreshToken },
    });
    assert.equal(statut, 401);
  });
});
