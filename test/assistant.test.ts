import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { MemoireConversations } from "../src/services/assistant/memoire.ts";
import { type ApiDeTest, appeler, connecterTous, demarrer, fermerBase, reinitialiserBase } from "./aide.ts";

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

interface Trame {
  evenement: string;
  donnees: any;
}

/** Découpe un flux SSE en trames { evenement, donnees }. */
function lireTrames(texte: string): Trame[] {
  return texte
    .split("\n\n")
    .filter(Boolean)
    .map((bloc) => {
      const lignes = bloc.split("\n");
      const evenement = lignes.find((l) => l.startsWith("event: "))?.slice(7) ?? "message";
      const donnees = lignes.find((l) => l.startsWith("data: "))?.slice(6) ?? "null";
      return { evenement, donnees: JSON.parse(donnees) };
    });
}

const demander = (jeton: string, question: unknown) =>
  appeler(api.base, "/api/assistant/flux", { methode: "POST", jeton, corps: { question } });

const texteDe = (trames: Trame[]) =>
  trames.filter((t) => t.evenement === "message").map((t) => t.donnees.delta).join("");

describe("Assistant en Server-Sent Events", () => {
  test("diffuse des événements data: puis event: fin", async () => {
    const { statut, entetes, texte } = await demander(jetons.alice, "Avez-vous Germinal ?");
    assert.equal(statut, 200);
    assert.match(entetes.get("content-type") ?? "", /^text\/event-stream/);

    const trames = lireTrames(texte);
    const messages = trames.filter((t) => t.evenement === "message");
    assert.ok(messages.length > 1, "plusieurs morceaux de texte");
    assert.equal(trames.at(-1)?.evenement, "fin");
    assert.ok(trames.at(-1)?.donnees.jetons.sortie > 0);

    assert.ok(trames.some((t) => t.evenement === "outil" && t.donnees.nom === "rechercher_ouvrages"));
    assert.match(texteDe(trames), /Germinal/);
  });

  test("l'outil mes_emprunts ne révèle que les emprunts de l'utilisateur connecté", async () => {
    const alice = texteDe(lireTrames((await demander(jetons.alice, "Quels sont mes emprunts ?")).texte));
    const bruno = texteDe(lireTrames((await demander(jetons.bruno, "Quels sont mes emprunts ?")).texte));
    assert.match(alice, /Germinal/);
    assert.doesNotMatch(alice, /Candide/);
    assert.match(bruno, /Candide/);
    assert.doesNotMatch(bruno, /Germinal/);
  });

  test("un bibliothécaire n'obtient que ses propres emprunts via l'assistant", async () => {
    const texte = texteDe(lireTrames((await demander(jetons.bibliothecaire, "Mes emprunts ?")).texte));
    assert.match(texte, /aucun emprunt/);
  });

  test("route authentifiée : 401 sans jeton", async () => {
    const { statut } = await appeler(api.base, "/api/assistant/flux", {
      methode: "POST",
      corps: { question: "Bonjour" },
    });
    assert.equal(statut, 401);
  });

  test("question vide ou de plus de 500 caractères : 400", async () => {
    const vide = await demander(jetons.alice, "");
    const longue = await demander(jetons.alice, "a".repeat(501));
    assert.deepEqual([vide.statut, longue.statut], [400, 400]);
    assert.equal(longue.corps.details[0].champ, "body.question");
  });

  test("limité à 10 appels par minute et par utilisateur (429), sans gêner les autres", async () => {
    // Application dédiée : compteurs neufs, non entamés par les tests précédents.
    const dediee = await demarrer();
    const poser = (jeton: string) =>
      appeler(dediee.base, "/api/assistant/flux", { methode: "POST", jeton, corps: { question: "Candide ?" } });
    try {
      const statuts: number[] = [];
      for (let i = 0; i < 11; i++) statuts.push((await poser(jetons.alice)).statut);
      assert.deepEqual(statuts.slice(0, 10), Array(10).fill(200));
      assert.equal(statuts[10], 429);
      // Le compteur est propre à chaque utilisateur.
      assert.equal((await poser(jetons.bruno)).statut, 200);
    } finally {
      await dediee.fermer();
    }
  });

  test("la fermeture du client interrompt la génération", async () => {
    const lignes: string[] = [];
    const origine = console.log;
    console.log = (...args: unknown[]) => {
      lignes.push(args.join(" "));
      origine(...args);
    };
    try {
      const annulation = new AbortController();
      const reponse = await fetch(`${api.base}/api/assistant/flux`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jetons.bruno}` },
        body: JSON.stringify({ question: "Avez-vous Germinal ?" }),
        signal: annulation.signal,
      });
      const lecteur = reponse.body!.getReader();
      await lecteur.read(); // premier morceau reçu, puis le client part
      annulation.abort();
      await new Promise((r) => setTimeout(r, 200));
    } finally {
      console.log = origine;
    }
    assert.ok(
      lignes.some((l) => /assistant utilisateur=3 .*statut=interrompu/.test(l)),
      "la génération est journalisée comme interrompue",
    );
  });
});

describe("Mémoire de conversation", () => {
  test("DELETE /api/assistant/memoire efface la conversation (204)", async () => {
    await demander(jetons.alice, "Avez-vous Candide ?");
    const { statut } = await appeler(api.base, "/api/assistant/memoire", { methode: "DELETE", jeton: jetons.alice });
    assert.equal(statut, 204);
  });

  test("la mémoire est propre à chaque utilisateur et tronquée aux dix derniers échanges", () => {
    const memoire = new MemoireConversations();
    for (let i = 1; i <= 12; i++) memoire.ajouter(1, `question ${i}`, `réponse ${i}`);
    memoire.ajouter(2, "autre", "conversation");

    const historique = memoire.lire(1);
    assert.equal(historique.length, 20);
    assert.equal(historique[0]?.content, "question 3");
    assert.equal(historique.at(-1)?.content, "réponse 12");
    assert.equal(memoire.lire(2).length, 2);

    memoire.effacer(1);
    assert.equal(memoire.lire(1).length, 0);
    assert.equal(memoire.lire(2).length, 2);
  });
});
