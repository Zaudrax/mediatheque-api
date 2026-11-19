# mediatheque-api

API REST d'une médiathèque associative : catalogue, comptes, emprunts, réservations et assistant conversationnel.
TypeScript strict exécuté par Node.js 24, Express 5, Zod 4, Prisma 7 (PostgreSQL), jose, bcrypt, SDK OpenAI, OpenAPI 3.1.

- Documentation interactive : `/api/docs` (Swagger UI), spécification brute : `/api/docs.json`
- Requêtes de test (y compris les cas d'erreur) : [`requetes.http`](requetes.http)

## Sommaire

1. [Prérequis](#prérequis)
2. [Lancement en local](#lancement-en-local)
3. [Lancement avec Docker](#lancement-avec-docker)
4. [Variables d'environnement](#variables-denvironnement)
5. [Authentification](#authentification)
6. [Rôles et droits par route](#rôles-et-droits-par-route)
7. [Règles métier](#règles-métier)
8. [Assistant](#assistant)
9. [Exemples d'appels](#exemples-dappels)
10. [Tests et intégration continue](#tests-et-intégration-continue)
11. [Sécurité : relecture OWASP API Top 10](#sécurité--relecture-owasp-api-top-10)
12. [Choix techniques](#choix-techniques)
13. [Structure du projet](#structure-du-projet)

## Prérequis

- Node.js 24 (un fichier `.nvmrc` est fourni : `nvm use`)
- Docker, pour PostgreSQL (ou un PostgreSQL 15+ déjà installé)
- Facultatif : une clé OpenAI pour l'assistant ; sans clé, le mode bouchon fait tout fonctionner

## Lancement en local

```bash
git clone <url-du-depot> mediatheque-api
cd mediatheque-api
npm ci                 # dépendances + génération du client Prisma (postinstall)
cp .env.example .env   # renseigner POSTGRES_PASSWORD, DATABASE_URL et les deux secrets JWT
npm run db:up          # PostgreSQL dans Docker
npm run db:deploy      # migrations
npm run seed           # 3 comptes, 10 ouvrages, 3 emprunts, 1 réservation (refusé si NODE_ENV=production)
npm run dev            # http://localhost:3000/sante et http://localhost:3000/api/docs
```

`npm run dev` exécute directement les sources TypeScript (`node --watch src/index.ts`) : Node 24 retire les annotations de type à la volée. `npm run check` vérifie les types avec `tsc --noEmit` en mode strict.

### Comptes de démonstration (créés par `npm run seed`)

Adresses et mots de passe fictifs, valables uniquement pour la base de démonstration locale.

| E-mail                       | Rôle             | Mot de passe        |
| ---------------------------- | ---------------- | ------------------- |
| `bibliothecaire@example.net` | `bibliothecaire` | `Biblio-Demo-2026!` |
| `camille@example.net`        | `membre`         | `Membre-Demo-2026!` |
| `leon@example.net`           | `membre`         | `Membre-Demo-2026!` |

Données : Camille emprunte « Les Misérables » (réservé par Léon), Léon emprunte « Germinal », Camille a rendu « Madame Bovary ».

## Lancement avec Docker

Le `Dockerfile` est multi-étapes : la première étape installe tout et compile avec `tsc` ; l'image finale ne contient que les dépendances de production et `dist/`, tourne avec l'utilisateur `node` et lance `node dist/index.js`.

**API et base ensemble (recommandé)** — le service `api` applique les migrations puis démarre :

```bash
cp .env.example .env            # renseigner les valeurs
docker compose --profile app up --build -d
curl http://localhost:3000/sante          # API_PORT, 3000 par défaut
docker compose --profile app logs -f api  # journal (une ligne par requête)
```

Pour charger les données de démonstration dans cette base : `npm run seed` depuis l'hôte (le port PostgreSQL est exposé sur `127.0.0.1:POSTGRES_PORT`).

**Image seule**, avec une base existante joignable depuis le conteneur :

```bash
docker build -t mediatheque-api .
docker run --rm --env-file .env mediatheque-api npx prisma migrate deploy   # migrations
docker run -d -p 3000:3000 --env-file .env -e PORT=3000 mediatheque-api
```

Dans le `.env`, `DATABASE_URL` doit alors désigner une adresse joignable depuis le conteneur (par exemple `host.docker.internal`, ou `--network host` sous Linux).

## Variables d'environnement

La configuration est validée au démarrage (`src/config.ts`) : une variable manquante ou invalide arrête l'API avec un message explicite. `.env` et `.env.test` sont ignorés par git ; seuls `.env.example` et `.env.test.example`, sans valeur secrète, sont versionnés.

| Variable                     | Rôle                                                                 | Défaut / exemple          |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------- |
| `PORT`                       | Port HTTP de l'API                                                   | `3000`                    |
| `POSTGRES_USER`              | Utilisateur créé par le conteneur PostgreSQL                         | `mediatheque`             |
| `POSTGRES_PASSWORD`          | Mot de passe de cet utilisateur (à choisir)                          | —                         |
| `POSTGRES_DB`                | Nom de la base                                                       | `mediatheque`             |
| `POSTGRES_PORT`              | Port local exposé par le conteneur PostgreSQL                        | `5432`                    |
| `DATABASE_URL`               | Chaîne de connexion de Prisma et de l'API                            | `postgresql://mediatheque:MOT_DE_PASSE@localhost:5432/mediatheque?schema=public` |
| `JWT_ACCESS_SECRET`          | Secret des access tokens (32 caractères minimum)                     | —                         |
| `JWT_REFRESH_SECRET`         | Secret des refresh tokens, **différent** du précédent                | —                         |
| `ACCESS_TOKEN_DUREE`         | Durée de vie d'un access token                                       | `15m`                     |
| `REFRESH_TOKEN_DUREE_JOURS`  | Durée de vie d'un refresh token, en jours                            | `7`                       |
| `CORS_ORIGINS`               | Origines navigateur autorisées, séparées par des virgules            | `http://localhost:5173`   |
| `LIMITE_AUTH_MAX`            | Requêtes sur `/api/auth/*` par fenêtre et par IP                     | `10`                      |
| `LIMITE_AUTH_FENETRE_MS`     | Fenêtre de cette limite                                              | `900000` (15 min)         |
| `LIMITE_GENERALE_MAX`        | Requêtes sur toute l'API par fenêtre et par IP                       | `300`                     |
| `LIMITE_GENERALE_FENETRE_MS` | Fenêtre de cette limite                                              | `60000` (1 min)           |
| `LIMITE_ASSISTANT_MAX`       | Appels à l'assistant par minute et par utilisateur                   | `10`                      |
| `TRUST_PROXY`                | Nombre de proxys inverses devant l'API (pour lire la vraie IP)       | `0`                       |
| `DUREE_EMPRUNT_JOURS`        | Durée d'un emprunt créé au retour d'un ouvrage réservé               | `21`                      |
| `IA_FOURNISSEUR`             | `bouchon` (sans clé ni réseau) ou `openai`                           | `bouchon`                 |
| `OPENAI_API_KEY`             | Clé OpenAI, obligatoire si `IA_FOURNISSEUR=openai`                   | —                         |
| `OPENAI_MODELE`              | Modèle utilisé                                                       | `gpt-4.1-mini`            |
| `IA_MAX_JETONS_SORTIE`       | Plafond de jetons générés par appel au modèle                        | `400`                     |
| `API_PORT`                   | Port de l'hôte pour `docker compose --profile app up`                | `3000`                    |

### Générer les secrets

```bash
openssl rand -base64 48
# ou, sans OpenSSL :
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

Générer deux valeurs distinctes pour `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET`, propres à chaque environnement. Changer un secret invalide immédiatement tous les jetons signés avec lui. La clé OpenAI ne va que dans `.env`.

## Authentification

Deux jetons signés en HS256 avec jose, chacun avec son propre secret :

- **access token** : 15 minutes, porte l'identifiant (`sub`) et le rôle ; en-tête `Authorization: Bearer <accessToken>` ;
- **refresh token** : 7 jours, identifié par un `jti` enregistré en base (table `refresh_tokens`) : il est révocable et à usage unique.

Les mots de passe sont hachés avec bcrypt (coût 12) et ne sortent jamais de la couche d'accès aux données.

```
Client                                          API
  │ POST /api/auth/inscription {email, motDePasse} │
  │───────────────────────────────────────────────▶│ crée un membre (409 si l'e-mail existe)
  │◀──────────────── 201 {id, email, role} ────────│
  │ POST /api/auth/connexion {email, motDePasse}   │
  │───────────────────────────────────────────────▶│ bcrypt.compare ; même 401 que le compte existe ou non
  │◀──── 200 {accessToken, refreshToken, ...} ─────│ enregistre le jti du refresh token
  │ GET /api/ouvrages   Authorization: Bearer …    │
  │───────────────────────────────────────────────▶│ signature, émetteur, audience, expiration
  │◀──────────────────── 200 ──────────────────────│ (401 si le jeton manque ou est invalide)
  │   … l'access token expire au bout de 15 minutes …
  │ POST /api/auth/rafraichir {refreshToken}       │
  │───────────────────────────────────────────────▶│ révoque l'ancien jti, émet une nouvelle paire
  │◀──── 200 {accessToken, refreshToken, ...} ─────│ jeton rejoué → 401 et révocation de tous les jetons du compte
  │ POST /api/auth/deconnexion   Bearer …          │
  │───────────────────────────────────────────────▶│ révoque tous les refresh tokens de l'utilisateur
  │◀──────────────────── 204 ──────────────────────│
```

## Rôles et droits par route

- **membre** : compte créé par l'inscription. Lit le catalogue, gère ses propres emprunts et réservations.
- **bibliothecaire** : gère le catalogue et tous les emprunts et réservations. Ce rôle ne s'obtient pas par l'API.

Un emprunt ou une réservation qui n'appartient pas au membre connecté est traité comme inexistant (404), pour ne pas révéler son existence. Toutes les routes peuvent aussi répondre 429 au-delà de 300 requêtes par minute et par IP.

| Méthode  | Chemin                        | Accès                                   | Succès | Erreurs                 |
| -------- | ----------------------------- | --------------------------------------- | ------ | ----------------------- |
| `GET`    | `/sante`                      | public                                  | 200    | 503                     |
| `GET`    | `/api/docs`, `/api/docs.json` | public                                  | 200    | —                       |
| `POST`   | `/api/auth/inscription`       | public                                  | 201    | 400, 409, 429           |
| `POST`   | `/api/auth/connexion`         | public                                  | 200    | 400, 401, 429           |
| `POST`   | `/api/auth/rafraichir`        | public (refresh token)                  | 200    | 400, 401, 429           |
| `POST`   | `/api/auth/deconnexion`       | connecté                                | 204    | 401, 429                |
| `GET`    | `/api/ouvrages`               | connecté                                | 200    | 400, 401                |
| `GET`    | `/api/ouvrages/:id`           | connecté (membre : ses emprunts en cours seulement) | 200 | 400, 401, 404 |
| `POST`   | `/api/ouvrages`               | bibliothécaire                          | 201    | 400, 401, 403           |
| `PATCH`  | `/api/ouvrages/:id`           | bibliothécaire                          | 200    | 400, 401, 403, 404      |
| `DELETE` | `/api/ouvrages/:id`           | bibliothécaire                          | 204    | 400, 401, 403, 404, 409 |
| `GET`    | `/api/emprunts`               | membre : les siens ; bibliothécaire : tous | 200 | 400, 401                |
| `GET`    | `/api/emprunts/:id`           | propriétaire ou bibliothécaire          | 200    | 400, 401, 404           |
| `POST`   | `/api/emprunts`               | membre : pour lui ; bibliothécaire : pour un membre | 201 | 400, 401, 404, 409 |
| `PATCH`  | `/api/emprunts/:id`           | propriétaire ou bibliothécaire (dates)  | 200    | 400, 401, 404           |
| `POST`   | `/api/emprunts/:id/retour`    | propriétaire ou bibliothécaire          | 200    | 400, 401, 404, 409      |
| `DELETE` | `/api/emprunts/:id`           | bibliothécaire                          | 204    | 400, 401, 403, 404      |
| `GET`    | `/api/reservations`           | membre : les siennes ; bibliothécaire : toutes | 200 | 400, 401              |
| `GET`    | `/api/reservations/:id`       | propriétaire ou bibliothécaire          | 200    | 400, 401, 404           |
| `POST`   | `/api/reservations`           | membre : pour lui ; bibliothécaire : pour un membre | 201 | 400, 401, 404, 409 |
| `DELETE` | `/api/reservations/:id`       | propriétaire ou bibliothécaire (annule) | 204    | 400, 401, 404, 409      |
| `POST`   | `/api/assistant/flux`         | connecté, 10 appels / minute            | 200 (SSE) | 400, 401, 429        |
| `DELETE` | `/api/assistant/memoire`      | connecté (sa conversation)              | 204    | 401                     |

## Règles métier

**Emprunts**

- Créer un emprunt rend l'ouvrage indisponible dans la même transaction. La mise à jour est conditionnelle (`disponible = true`) : de deux emprunts simultanés du même ouvrage, un seul réussit ; l'autre reçoit 409 et rien n'est écrit.
- `PATCH` ne modifie que les dates : ni l'ouvrage, ni le propriétaire, ni le statut. La lecture et la mise à jour se font dans une même transaction, la ligne étant verrouillée (`SELECT … FOR UPDATE`) pendant la vérification de l'ordre des dates.

**Catalogue**

- `DELETE /api/ouvrages/:id` (204) retire un ouvrage du catalogue :
  - emprunté : **409** ;
  - jamais emprunté ni réservé : supprimé définitivement ;
  - avec un historique d'emprunts ou de réservations : **archivé** (colonne `archive_le`). Il disparaît des listes, du détail (404) et de la recherche de l'assistant ; il ne peut plus être emprunté, réservé ni modifié, mais ses emprunts et réservations passés restent consultables avec son titre. Les clés étrangères `RESTRICT` restent en place : aucun historique ne peut être effacé par erreur.

**Réservations**

- Un membre réserve un ouvrage **indisponible** ; un ouvrage disponible renvoie 409 (il suffit de l'emprunter).
- Une seule réservation active par membre et par ouvrage, garantie par une contrainte d'unicité en base (409). L'historique (réservations honorées ou annulées) reste illimité : la colonne `active` vaut `true` pour une réservation active et `NULL` ensuite, et PostgreSQL considère les `NULL` comme distincts dans un index unique.
- Un membre ne réserve pas un ouvrage qu'il emprunte déjà (409).
- `DELETE /api/reservations/:id` annule la réservation (statut `annulee`, conservée dans l'historique) ; une réservation déjà honorée ou annulée renvoie 409.
- **Au retour d'un emprunt**, dans la même transaction : la réservation active la plus ancienne de l'ouvrage passe au statut `honoree` et devient un emprunt de `DUREE_EMPRUNT_JOURS` jours pour son membre ; l'ouvrage reste indisponible. Sans réservation, l'ouvrage redevient disponible. La réponse indique `empruntSuivantId`. La ligne de l'ouvrage est verrouillée (`SELECT … FOR UPDATE`) pendant ces opérations, ce qui empêche une réservation concurrente de rester active sur un ouvrage redevenu disponible.

## Assistant

`POST /api/assistant/flux` répond en langage naturel aux questions d'un utilisateur connecté sur le catalogue, ses emprunts et ses réservations. La réponse est diffusée en **Server-Sent Events** :

```
event: outil
data: {"nom":"rechercher_ouvrages"}

data: {"delta":"J'ai trouvé "}

data: {"delta":"« Germinal » de Émile Zola (emprunté)."}

event: fin
data: {"jetons":{"entree":412,"sortie":38}}
```

En cas d'échec du fournisseur : `event: erreur` avec un message neutre (le détail n'est écrit que dans la console du serveur).

- **Outils** : `rechercher_ouvrages` (titre ou auteur, disponibilité), `mes_emprunts`, `mes_reservations`. Ils sont construits pour l'utilisateur connecté, par fermeture : aucun n'accepte d'identifiant d'utilisateur en argument, et leurs arguments sont validés par Zod comme toute entrée externe. L'assistant ne peut donc rien révéler que l'utilisateur ne pourrait voir lui-même, même pour un bibliothécaire, limité à ses propres emprunts par ces outils.
- **Mémoire** : conversation indexée par l'identifiant de l'utilisateur authentifié, tronquée aux 10 derniers échanges ; `DELETE /api/assistant/memoire` l'efface. Elle est conservée en mémoire du processus (perdue au redémarrage).
- **Garde-fous de coût** : 10 appels par minute et par utilisateur, question de 500 caractères au plus, `max_output_tokens` plafonné, 3 allers-retours modèle ↔ outils au plus. La génération est interrompue dès que le client ferme la connexion.
- **Journal** : une ligne par appel avec les jetons consommés, sans la question ni la réponse :
  `assistant utilisateur=2 fournisseur=openai jetons_entree=412 jetons_sortie=38 statut=termine`.
- **Fournisseurs** (`IA_FOURNISSEUR`) : `openai` (SDK officiel, API Responses, streaming et function calling) ou `bouchon` (aucune clé, aucun réseau : il choisit un outil par mots-clés, l'exécute réellement et diffuse une réponse mot à mot). Les tests utilisent toujours le bouchon.

> **État des tests de l'assistant** : testé en mode **bouchon** uniquement (tests automatisés et `curl -N`). Le mode `openai` est implémenté mais n'a pas été exécuté avec une clé réelle.

## Exemples d'appels

```bash
# Connexion : récupérer un access token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/connexion \
  -H "Content-Type: application/json" \
  -d '{"email":"camille@example.net","motDePasse":"Membre-Demo-2026!"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# Catalogue : ouvrages disponibles, 5 par page
curl "http://localhost:3000/api/ouvrages?disponible=true&limite=5" -H "Authorization: Bearer $TOKEN"

# Emprunter un ouvrage disponible
curl -X POST http://localhost:3000/api/emprunts -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"ouvrageId":3,"dateRetourPrevue":"2026-12-07"}'

# Réserver un ouvrage indisponible
curl -X POST http://localhost:3000/api/reservations -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"ouvrageId":4}'

# Assistant en SSE : -N désactive la mise en tampon, la réponse s'affiche au fil de l'eau
curl -N -X POST http://localhost:3000/api/assistant/flux -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"question":"Avez-vous un roman de Zola disponible ?"}'
```

Toutes les routes, cas d'erreur compris, sont dans [`requetes.http`](requetes.http) (extension VS Code « REST Client ») : les jetons y sont récupérés automatiquement à la connexion. Le fichier contient 10 requêtes `/api/auth/*` puis une onzième qui montre le 429 : redémarrer l'API pour le rejouer.

## Tests et intégration continue

```bash
cp .env.test.example .env.test   # DATABASE_URL vers une base *_test, deux secrets, IA_FOURNISSEUR=bouchon
npm test                         # applique les migrations sur la base de test, puis lance les tests
npm run check                    # tsc --noEmit, mode strict
npm audit --audit-level=high
```

59 tests `node:test` + `fetch`, contre l'application démarrée sur un port éphémère et une base **distincte** de la base de développement (garde-fou : le nom doit finir par `_test`). Ils couvrent :

- comptes et jetons : inscription, doublon, rôle imposé, connexion réussie et échouée, rafraîchissement et rotation, déconnexion ;
- droits : 401, 403, propriété des emprunts et des réservations, propriétaire non modifiable ;
- durcissement : helmet, CORS, taille des corps, 429 à la onzième tentative, pas de pile dans les erreurs ;
- réservations : ouvrage disponible (409), doublon (409), annulation, file d'attente servie au retour dans la même transaction ;
- catalogue : suppression d'un ouvrage sans historique, archivage d'un ouvrage avec un historique d'emprunts ou de réservations, ouvrage archivé introuvable pour l'emprunt, la réservation et la modification ;
- documentation : `/api/docs.json` (200, OpenAPI 3.1, toutes les routes avec leurs erreurs et `bearerAuth`) et `/api/docs` (Swagger UI) ;
- assistant : événements `data:` puis `event: fin`, outils limités à l'utilisateur, 400, 401, 429 par utilisateur, interruption à la fermeture du client, mémoire tronquée et effacée.

Le workflow `.github/workflows/ci.yml` exécute à chaque pull request : `npm ci`, `npm audit --audit-level=high`, `npm run check`, `npm test` (service PostgreSQL jetable, secrets JWT générés pour l'exécution) et `docker build`.

## Sécurité : relecture OWASP API Top 10

| Risque OWASP API                              | Exemple                                     | Parade dans ce projet                                                                                     |
| --------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Autorisation au niveau des objets cassée      | `GET /api/emprunts/42` d'un autre membre    | Portée `{ emprunteurId }` / `{ membreId }` appliquée dans chaque requête (`porteeEmprunts`, `porteeReservations` dans `src/middlewares/authentifier.ts`, filtres des dépôts) ; hors portée → 404. Outils de l'assistant liés à l'utilisateur par fermeture (`src/services/assistant/outils.ts`). |
| Authentification cassée                       | jetons sans expiration, secret faible       | Access 15 min, refresh révocable à usage unique avec détection de rejeu (`src/services/auth.ts`) ; secrets de 32 caractères minimum validés au démarrage (`src/config.ts`) ; bcrypt coût 12 ; 429 après 10 tentatives (`src/app.ts`). |
| Exposition excessive de données               | renvoyer `motDePasseHache`                  | `select` explicites (`champsPublics` dans `src/repositories/utilisateurs.ts`, `inclure` dans les dépôts) ; champ technique `active` omis des réservations ; journal sans corps. |
| Consommation de ressources illimitée          | corps de 50 Mo, liste sans pagination       | `express.json({ limit: "100kb" })`, pagination plafonnée à 50 (`src/schemas/commun.ts`), limites de débit générale, auth et assistant ; jetons de sortie et tours d'outils plafonnés, arrêt à la fermeture du client. |
| Autorisation au niveau des fonctions cassée   | `DELETE /ouvrages` ouvert aux membres       | `exigerRole("bibliothecaire")` sur les écritures du catalogue et la suppression d'emprunts (`src/routes/*.ts`) ; testé (403). |
| Affectation en masse                          | `role: "admin"` dans l'inscription          | Schémas Zod qui retirent les champs inconnus (`src/schemas/`) ; rôle forcé à `membre` (`src/repositories/utilisateurs.ts`) ; `emprunteurId`/`membreId` imposés pour un membre. |
| Mauvaise configuration                        | pile dans les réponses, CORS `*`            | Gestionnaire d'erreurs unique sans pile (`src/middlewares/gestionErreurs.ts`), helmet, `x-powered-by` désactivé, origines CORS explicites (`src/middlewares/securite.ts`), image Docker non root. |
| Injection                                     | `where: { email: req.body.email }` avec un objet | Validation des types par Zod avant toute requête ; Prisma paramétré ; seul SQL brut : les verrous `SELECT … FOR UPDATE` en requêtes paramétrées (`src/repositories/ouvrages.ts`, `src/repositories/emprunts.ts`). |
| Inventaire incomplet                          | vieille route `/v1/debug` oubliée           | Spécification OpenAPI générée depuis les schémas de validation (`src/docs/openapi.ts`) ; un test vérifie que chaque route est documentée (`test/docs.test.ts`). |
| Consommation non sûre d'API tierces           | faire confiance à la réponse d'un service externe | Arguments des appels d'outils du modèle validés par Zod (`src/schemas/assistant.ts`), erreurs du fournisseur traduites en `event: erreur` neutre, clé OpenAI uniquement côté serveur. |

## Choix techniques

- **PostgreSQL + Prisma 7** : les données sont fortement liées (ouvrages, emprunts, réservations, comptes) et reposent sur des contraintes d'intégrité et des transactions (emprunt atomique, file de réservations servie au retour). Prisma 7 s'utilise avec l'adaptateur `pg` et génère un client TypeScript.
- **TypeScript exécuté par Node 24** : syntaxe effaçable uniquement (`erasableSyntaxOnly`), imports en `.ts` ; `tsc --noEmit` vérifie, `tsc -p tsconfig.build.json` compile pour l'image Docker. Les types des entrées dérivent des schémas Zod (`z.output`) via le middleware `valider`, et `req.utilisateur` est typé par déclaration globale (`src/types/express.d.ts`).
- **zod-openapi** : la spécification OpenAPI 3.1 est produite à partir des schémas Zod qui valident déjà les requêtes ; la documentation ne peut pas diverger de la validation.
- **SDK OpenAI (API Responses)** plutôt que LangChain.js : un seul fournisseur, deux à trois outils et une mémoire simple n'ont pas besoin d'une couche d'orchestration ; la boucle d'appels d'outils reste explicite et lisible (`src/services/assistant/openai.ts`). L'interface `FournisseurIa` permet d'ajouter un autre fournisseur sans toucher aux routes.

## Structure du projet

```
prisma/
  schema.prisma            modèles Utilisateur, RefreshToken, Ouvrage, Emprunt, Reservation
  migrations/              migrations versionnées
  seed.ts                  seeder rejouable, refusé si NODE_ENV=production (il vide les tables)
prisma.config.ts           configuration Prisma 7 (schéma, migrations, seed, URL)
src/
  index.ts                 démarrage du serveur HTTP et arrêt propre
  app.ts                   creerApp() : middlewares, routeurs, 404, erreurs
  config.ts                lecture et validation des variables d'environnement
  db.ts                    client Prisma avec l'adaptateur pg
  erreurs.ts               erreurs métier (400, 401, 403, 404, 409, 503)
  types/                   types du domaine, extension de Request
  routes/                  un routeur par ressource : auth, ouvrages, emprunts, reservations, assistant, docs
  services/                règles métier et transactions : auth, jetons, ouvrages, emprunts, reservations
  services/assistant/      assistant : fournisseurs openai et bouchon, outils, mémoire
  repositories/            accès aux données (toutes les requêtes Prisma)
  schemas/                 schémas Zod (entrées et réponses), types dérivés
  middlewares/             journal, validation, authentification, sécurité, 404, erreurs
  docs/openapi.ts          spécification OpenAPI 3.1 générée depuis les schémas
test/                      tests node:test + fetch
Dockerfile                 image multi-étapes (tsc puis node dist/index.js)
docker-compose.yml         PostgreSQL, et l'API avec le profil « app »
.github/workflows/ci.yml   npm ci, audit, check, test, docker build
requetes.http              requêtes de test (extension VS Code REST Client)
```
