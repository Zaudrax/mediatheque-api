# mediatheque-api

API REST d'une médiathèque associative : catalogue d'ouvrages, comptes et suivi des emprunts.
Node.js 24, Express 5, Zod 4, Prisma 7 (PostgreSQL, adaptateur `pg`), jose, bcrypt.

## Prérequis

- Node.js 24 (un fichier `.nvmrc` est fourni : `nvm use`)
- Docker, pour lancer PostgreSQL (ou un PostgreSQL déjà installé)

## Installation

```bash
git clone <url-du-depot> mediatheque-api
cd mediatheque-api
npm ci                 # installe les dépendances et génère le client Prisma (postinstall)
cp .env.example .env   # puis renseigner les valeurs, voir ci-dessous
npm run db:up          # démarre PostgreSQL dans Docker
npm run db:deploy      # applique les migrations
npm run seed           # 3 comptes, 10 ouvrages, 3 emprunts dont un rendu
npm run dev            # http://localhost:3000/sante
```

### Comptes de démonstration (créés par `npm run seed`)

Adresses et mots de passe fictifs, valables uniquement pour la base de démonstration locale.

| E-mail                       | Rôle             | Mot de passe        |
| ---------------------------- | ---------------- | ------------------- |
| `bibliothecaire@example.net` | `bibliothecaire` | `Biblio-Demo-2026!` |
| `camille@example.net`        | `membre`         | `Membre-Demo-2026!` |
| `leon@example.net`           | `membre`         | `Membre-Demo-2026!` |

## Variables d'environnement

| Variable                     | Rôle                                                              | Défaut / exemple                     |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| `PORT`                       | Port HTTP de l'API                                                | `3000`                               |
| `POSTGRES_USER`              | Utilisateur créé par le conteneur PostgreSQL                      | `mediatheque`                        |
| `POSTGRES_PASSWORD`          | Mot de passe de cet utilisateur (à choisir)                       | —                                    |
| `POSTGRES_DB`                | Nom de la base                                                    | `mediatheque`                        |
| `POSTGRES_PORT`              | Port local exposé par le conteneur                                | `5432`                               |
| `DATABASE_URL`               | Chaîne de connexion utilisée par Prisma et par l'API              | `postgresql://mediatheque:MOT_DE_PASSE@localhost:5432/mediatheque?schema=public` |
| `JWT_ACCESS_SECRET`          | Secret de signature des access tokens (32 caractères minimum)     | —                                    |
| `JWT_REFRESH_SECRET`         | Secret de signature des refresh tokens, **différent** du précédent | —                                    |
| `ACCESS_TOKEN_DUREE`         | Durée de vie d'un access token                                    | `15m`                                |
| `REFRESH_TOKEN_DUREE_JOURS`  | Durée de vie d'un refresh token, en jours                         | `7`                                  |
| `CORS_ORIGINS`               | Origines navigateur autorisées, séparées par des virgules         | `http://localhost:5173`              |
| `LIMITE_AUTH_MAX`            | Requêtes autorisées sur `/api/auth/*` par fenêtre et par IP       | `10`                                 |
| `LIMITE_AUTH_FENETRE_MS`     | Fenêtre de cette limite                                           | `900000` (15 min)                    |
| `LIMITE_GENERALE_MAX`        | Requêtes autorisées sur toute l'API par fenêtre et par IP         | `300`                                |
| `LIMITE_GENERALE_FENETRE_MS` | Fenêtre de cette limite                                           | `60000` (1 min)                      |
| `TRUST_PROXY`                | Nombre de proxys inverses devant l'API (pour lire la vraie IP)    | `0`                                  |

La configuration est validée au démarrage (`src/config.js`) : une variable manquante ou trop courte arrête l'API avec un message explicite. `.env` et `.env.test` sont ignorés par git ; seuls `.env.example` et `.env.test.example`, sans valeur secrète, sont versionnés.

### Générer les secrets

Chaque secret JWT doit être long, aléatoire et propre à chaque environnement (développement, test, production) :

```bash
openssl rand -base64 48
# ou, sans OpenSSL :
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

Générer deux valeurs distinctes pour `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET`. Changer un secret invalide immédiatement tous les jetons signés avec lui.

## Scripts

| Commande             | Effet                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `npm run dev`        | Lance l'API et la redémarre à chaque modification (`--watch`)         |
| `npm start`          | Lance l'API                                                           |
| `npm run db:up`      | Démarre PostgreSQL (`docker compose up -d --wait`)                    |
| `npm run db:down`    | Arrête PostgreSQL (les données sont conservées dans un volume)        |
| `npm run db:migrate` | Crée et applique une migration en développement                       |
| `npm run db:deploy`  | Applique les migrations existantes                                    |
| `npm run seed`       | Rejoue le jeu de démonstration (rejouable, sans doublon)              |
| `npm test`           | Applique les migrations sur la base de test puis lance les tests      |

## Authentification

Deux jetons signés en HS256 avec [jose](https://github.com/panva/jose), chacun avec son propre secret :

- **access token** : durée de vie 15 minutes, porte l'identifiant (`sub`) et le rôle ; à envoyer dans l'en-tête `Authorization: Bearer <accessToken>` ;
- **refresh token** : durée de vie 7 jours, identifié par un `jti` unique enregistré en base (table `refresh_tokens`), ce qui permet de le révoquer.

Les mots de passe sont hachés avec bcrypt (coût 12) et ne sortent jamais de la couche d'accès aux données : ni les réponses, ni les jetons, ni les journaux ne les contiennent.

### Séquence

```
Client                                         API
  │ POST /api/auth/inscription {email, motDePasse}│
  │──────────────────────────────────────────────▶│ crée un membre (409 si l'e-mail existe)
  │◀──────────────── 201 {id, email, role} ───────│
  │                                               │
  │ POST /api/auth/connexion {email, motDePasse}  │
  │──────────────────────────────────────────────▶│ bcrypt.compare ; 401 identique que le compte existe ou non
  │◀──── 200 {accessToken, refreshToken, ...} ────│ enregistre le jti du refresh token
  │                                               │
  │ GET /api/ouvrages                             │
  │ Authorization: Bearer <accessToken>           │
  │──────────────────────────────────────────────▶│ vérifie signature, émetteur, audience, expiration
  │◀──────────────────── 200 ─────────────────────│ (401 si le jeton manque ou est invalide)
  │                                               │
  │   … 15 minutes plus tard, l'access token a expiré …
  │                                               │
  │ POST /api/auth/rafraichir {refreshToken}      │
  │──────────────────────────────────────────────▶│ révoque l'ancien jti, émet une nouvelle paire (rotation)
  │◀──── 200 {accessToken, refreshToken, ...} ────│ un jeton déjà utilisé → 401 et révocation de tous les jetons du compte
  │                                               │
  │ POST /api/auth/deconnexion                    │
  │ Authorization: Bearer <accessToken>           │
  │──────────────────────────────────────────────▶│ révoque tous les refresh tokens de l'utilisateur
  │◀──────────────────── 204 ─────────────────────│
```

## Rôles et droits par route

- **membre** : compte créé par l'inscription. Consulte le catalogue, gère ses propres emprunts.
- **bibliothecaire** : gère le catalogue et tous les emprunts. Ce rôle ne s'obtient pas par l'API : le champ `role` envoyé à l'inscription est ignoré.

Un emprunt qui n'appartient pas au membre connecté est traité comme inexistant (404) afin de ne pas révéler son existence.

| Méthode  | Chemin                     | Public | Membre                         | Bibliothécaire | Succès | Erreurs possibles       |
| -------- | -------------------------- | :----: | ------------------------------ | :------------: | ------ | ----------------------- |
| `GET`    | `/sante`                   |   ✓    | ✓                              |       ✓        | 200    | 503                     |
| `POST`   | `/api/auth/inscription`    |   ✓    | ✓                              |       ✓        | 201    | 400, 409, 429           |
| `POST`   | `/api/auth/connexion`      |   ✓    | ✓                              |       ✓        | 200    | 400, 401, 429           |
| `POST`   | `/api/auth/rafraichir`     |   ✓    | ✓                              |       ✓        | 200    | 400, 401, 429           |
| `POST`   | `/api/auth/deconnexion`    |        | ✓                              |       ✓        | 204    | 401, 429                |
| `GET`    | `/api/ouvrages`            |        | ✓                              |       ✓        | 200    | 400, 401                |
| `GET`    | `/api/ouvrages/:id`        |        | ✓ (seuls ses emprunts en cours) |       ✓        | 200    | 400, 401, 404           |
| `POST`   | `/api/ouvrages`            |        | 403                            |       ✓        | 201    | 400, 401, 403           |
| `PATCH`  | `/api/ouvrages/:id`        |        | 403                            |       ✓        | 200    | 400, 401, 403, 404      |
| `DELETE` | `/api/ouvrages/:id`        |        | 403                            |       ✓        | 204    | 400, 401, 403, 404, 409 |
| `GET`    | `/api/emprunts`            |        | ses emprunts                   |      tous      | 200    | 400, 401                |
| `GET`    | `/api/emprunts/:id`        |        | ses emprunts                   |      tous      | 200    | 400, 401, 404           |
| `POST`   | `/api/emprunts`            |        | pour lui-même                  | pour un membre | 201    | 400, 401, 404, 409      |
| `PATCH`  | `/api/emprunts/:id`        |        | ses emprunts (dates)           | tous (dates)   | 200    | 400, 401, 404           |
| `POST`   | `/api/emprunts/:id/retour` |        | ses emprunts                   |      tous      | 200    | 400, 401, 404, 409      |
| `DELETE` | `/api/emprunts/:id`        |        | 403                            |       ✓        | 204    | 400, 401, 403, 404      |

Toutes les routes peuvent aussi répondre 429 au-delà de 300 requêtes par minute et par IP.

## Durcissement

- **helmet** : en-têtes de sécurité (CSP, HSTS, `nosniff`, etc.) ; `X-Powered-By` désactivé.
- **CORS** : seules les origines listées dans `CORS_ORIGINS` sont autorisées ; une autre origine reçoit 403. Les clients sans en-tête `Origin` (application mobile, curl) ne sont pas concernés.
- **Limitation de débit** (express-rate-limit, par IP) : 10 requêtes par quart d'heure sur `/api/auth/*` (la onzième reçoit 429), 300 requêtes par minute sur l'ensemble de l'API. Les en-têtes `RateLimit` et `RateLimit-Policy` indiquent le quota restant.
- **Corps JSON** limités à 100 Ko (413 au-delà).
- **Erreurs** : réponses JSON sans pile d'exécution ni message interne ; toute erreur de jeton donne 401, jamais 500.
- **Dépendances** : `npm audit --audit-level=high` est exécuté par la CI.

## Structure

```
prisma/
  schema.prisma          modèles Utilisateur, RefreshToken, Ouvrage, Emprunt
  migrations/            migrations versionnées
  seed.js                seeder rejouable
prisma.config.ts         configuration Prisma 7 (schéma, migrations, seed, URL)
src/
  index.js               démarrage du serveur HTTP et arrêt propre
  app.js                 creerApp() : middlewares, routeurs, 404, erreurs
  config.js              lecture et validation des variables d'environnement
  db.js                  client Prisma avec l'adaptateur pg
  erreurs.js             erreurs métier (400, 401, 403, 404, 409)
  routes/                un routeur par ressource (auth, ouvrages, emprunts)
  services/              authentification (bcrypt, rotation) et jetons (jose)
  repositories/          accès aux données (toutes les requêtes Prisma)
  schemas/               schémas Zod du corps, des paramètres et de la query string
  middlewares/           journal, validation, authentification, sécurité, 404, erreurs
test/                    tests node:test + fetch contre l'application sur un port éphémère
.github/workflows/ci.yml npm ci, npm audit, npm test à chaque pull request
requetes.http            requêtes de test (extension VS Code REST Client)
```

## Validation

Chaque corps, paramètre d'URL et query string passe par un schéma Zod (middleware `valider`). Les champs inconnus sont ignorés.

- `email` : adresse valide, mise en minuscules ; `motDePasse` : 12 caractères minimum, 72 octets maximum (limite de bcrypt)
- `titre` : 1 à 150 caractères ; `auteur` : 1 à 120 caractères ; `annee` : entier entre 1450 et l'année courante
- `dateEmprunt` (facultative, par défaut maintenant) et `dateRetourPrevue` : dates ISO 8601 (`2026-12-01` ou `2026-12-01T18:00:00Z`), retour après emprunt
- `emprunteurId` : pris en compte uniquement à la création d'un emprunt par un bibliothécaire ; jamais modifiable par `PATCH`
- `:id` : entier strictement positif
- `?page=` (≥ 1, défaut 1), `?limite=` (≥ 1, défaut 10, plafonnée à 50), `?disponible=true|false`, `?rendu=true|false`, `?ouvrageId=`, `?emprunteurId=` (bibliothécaire)

Une entrée invalide renvoie **400** avec la liste des champs fautifs :

```json
{
  "erreur": "Validation échouée",
  "details": [
    { "champ": "body.email", "message": "doit être une adresse e-mail valide" },
    { "champ": "body.motDePasse", "message": "doit contenir au moins 12 caractères" }
  ]
}
```

Les listes sont paginées :

```json
{
  "donnees": [ ... ],
  "pagination": { "page": 1, "limite": 10, "total": 10, "pages": 1 }
}
```

## Règles métier

- Créer un emprunt rend l'ouvrage indisponible dans la même transaction. La mise à jour est conditionnelle (`disponible = true`) : si deux emprunts du même ouvrage arrivent en même temps, un seul réussit, l'autre reçoit **409** et rien n'est écrit.
- `POST /api/emprunts/:id/retour` marque l'emprunt rendu et l'ouvrage de nouveau disponible, dans une transaction. Un emprunt déjà rendu renvoie 409.
- Supprimer un ouvrage emprunté renvoie 409. Un ouvrage qui garde un historique d'emprunts est aussi protégé (clé étrangère `RESTRICT`, erreur Prisma P2003 → 409).
- Supprimer un emprunt en cours libère l'ouvrage.
- `disponible` n'est pas modifiable par `POST` ou `PATCH` : ce champ suit les emprunts.

## Erreurs et journal

- Un gestionnaire d'erreurs unique répond toujours en JSON (`{ "erreur": "..." }`). Il traduit les erreurs Zod en 400, les erreurs de jeton en 401, Prisma P2025 en 404, P2003 et P2002 en 409, un JSON mal formé en 400 ; toute autre erreur devient un 500 générique, le détail n'étant écrit que dans la console du serveur.
- Une route inconnue renvoie 404.
- Chaque requête produit une ligne de journal, sans corps ni en-têtes : `2026-11-16T10:21:49.884Z DELETE /api/ouvrages/11 409 8.0 ms`.

## Tests

Les tests (`node:test` et `fetch`) démarrent l'application sur un port éphémère et utilisent une **base distincte** de la base de développement, vidée avant chaque test.

```bash
cp .env.test.example .env.test   # renseigner DATABASE_URL (base *_test) et deux secrets
npm test                         # applique les migrations sur la base de test puis lance les tests
```

Ils couvrent l'inscription (doublon, rôle imposé), la connexion réussie et échouée, le rafraîchissement avec rotation, la déconnexion, les 401 et 403, la propriété des emprunts, les en-têtes helmet, CORS, la limite de taille des corps et le 429 à la onzième tentative.

La CI (`.github/workflows/ci.yml`) exécute `npm ci`, `npm audit --audit-level=high` et `npm test` à chaque pull request, avec un service PostgreSQL jetable et des secrets JWT générés pour l'exécution.

## Exemples de requêtes

```bash
# Connexion
curl -X POST http://localhost:3000/api/auth/connexion \
  -H "Content-Type: application/json" \
  -d '{"email":"camille@example.net","motDePasse":"Membre-Demo-2026!"}'

# Appel authentifié (remplacer <accessToken>)
curl "http://localhost:3000/api/ouvrages?disponible=true&limite=5" \
  -H "Authorization: Bearer <accessToken>"

# Emprunter un ouvrage
curl -X POST http://localhost:3000/api/emprunts \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"ouvrageId":3,"dateRetourPrevue":"2026-12-07"}'
```

Toutes les routes, cas d'erreur compris, sont dans [`requetes.http`](requetes.http) (extension VS Code « REST Client ») : les jetons y sont récupérés automatiquement à la connexion.
