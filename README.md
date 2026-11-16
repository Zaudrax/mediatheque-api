# mediatheque-api

API REST d'une médiathèque associative : catalogue d'ouvrages et suivi des emprunts.
Node.js 24, Express 5, Zod 4, Prisma 7 (PostgreSQL, adaptateur `pg`).

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
npm run seed           # 10 ouvrages, 3 emprunts dont un rendu
npm run dev            # http://localhost:3000/sante
```

## Variables d'environnement

| Variable            | Rôle                                                  | Exemple                                                           |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| `PORT`              | Port HTTP de l'API                                    | `3000`                                                            |
| `POSTGRES_USER`     | Utilisateur créé par le conteneur PostgreSQL          | `mediatheque`                                                     |
| `POSTGRES_PASSWORD` | Mot de passe de cet utilisateur (à choisir)           |                                                                   |
| `POSTGRES_DB`       | Nom de la base                                        | `mediatheque`                                                     |
| `POSTGRES_PORT`     | Port local exposé par le conteneur                    | `5432`                                                            |
| `DATABASE_URL`      | Chaîne de connexion utilisée par Prisma et par l'API  | `postgresql://mediatheque:MOT_DE_PASSE@localhost:5432/mediatheque?schema=public` |

`.env` est ignoré par git ; seul `.env.example`, sans valeur secrète, est versionné.

## Scripts

| Commande             | Effet                                                         |
| -------------------- | ------------------------------------------------------------- |
| `npm run dev`        | Lance l'API et la redémarre à chaque modification (`--watch`) |
| `npm start`          | Lance l'API                                                   |
| `npm run db:up`      | Démarre PostgreSQL (`docker compose up -d --wait`)            |
| `npm run db:down`    | Arrête PostgreSQL (les données sont conservées dans un volume) |
| `npm run db:migrate` | Crée et applique une migration en développement               |
| `npm run db:deploy`  | Applique les migrations existantes                            |
| `npm run seed`       | Rejoue le jeu de démonstration (rejouable, sans doublon)      |

## Structure

```
prisma/
  schema.prisma          modèles Ouvrage et Emprunt (relation 1-n)
  migrations/            migration initiale
  seed.js                seeder rejouable
prisma.config.ts         configuration Prisma 7 (schéma, migrations, seed, URL)
src/
  index.js               démarrage du serveur HTTP et arrêt propre
  app.js                 application Express : middlewares, routeurs, 404, erreurs
  db.js                  client Prisma avec l'adaptateur pg
  erreurs.js             erreurs métier (400, 404, 409)
  routes/                un routeur par ressource
  repositories/          accès aux données (toutes les requêtes Prisma)
  schemas/               schémas Zod du corps, des paramètres et de la query string
  middlewares/           journalisation, validation, 404, gestionnaire d'erreurs
requetes.http            requêtes de test (extension VS Code REST Client)
```

## Routes

| Méthode  | Chemin                        | Succès | Erreurs possibles |
| -------- | ----------------------------- | ------ | ----------------- |
| `GET`    | `/sante`                      | 200    | 503               |
| `GET`    | `/api/ouvrages`               | 200    | 400               |
| `GET`    | `/api/ouvrages/:id`           | 200    | 400, 404          |
| `POST`   | `/api/ouvrages`               | 201    | 400               |
| `PATCH`  | `/api/ouvrages/:id`           | 200    | 400, 404          |
| `DELETE` | `/api/ouvrages/:id`           | 204    | 400, 404, 409     |
| `GET`    | `/api/emprunts`               | 200    | 400               |
| `GET`    | `/api/emprunts/:id`           | 200    | 400, 404          |
| `POST`   | `/api/emprunts`               | 201    | 400, 404, 409     |
| `PATCH`  | `/api/emprunts/:id`           | 200    | 400, 404          |
| `DELETE` | `/api/emprunts/:id`           | 204    | 400, 404          |
| `POST`   | `/api/emprunts/:id/retour`    | 200    | 400, 404, 409     |

### Règles métier

- `GET /api/ouvrages/:id` inclut les emprunts en cours de l'ouvrage.
- **Créer un emprunt** rend l'ouvrage indisponible dans la même transaction. La mise à jour est conditionnelle (`disponible = true`) : si deux emprunts du même ouvrage arrivent en même temps, un seul réussit, l'autre reçoit **409** et rien n'est écrit.
- **`POST /api/emprunts/:id/retour`** marque l'emprunt rendu (avec la date `renduLe`) et l'ouvrage de nouveau disponible, dans une transaction. Un emprunt déjà rendu renvoie 409.
- **Supprimer un ouvrage** emprunté renvoie 409. Un ouvrage qui garde un historique d'emprunts rendus est aussi protégé (clé étrangère `RESTRICT`, erreur Prisma P2003 → 409) ; il faut d'abord supprimer ses emprunts.
- **Supprimer un emprunt** en cours libère l'ouvrage.
- `disponible` n'est pas modifiable par `POST` ou `PATCH` : ce champ suit les emprunts.
- `PATCH /api/emprunts/:id` modifie `emprunteur`, `dateEmprunt` et `dateRetourPrevue` ; le retour passe par la route dédiée.

### Validation

Chaque corps, paramètre d'URL et query string passe par un schéma Zod (middleware `valider`). Les champs inconnus sont ignorés.

- `titre` : 1 à 150 caractères ; `auteur` : 1 à 120 caractères
- `annee` : entier entre 1450 et l'année courante
- `emprunteur` : 2 à 80 caractères
- `dateEmprunt` (facultative, par défaut maintenant) et `dateRetourPrevue` : dates ISO 8601 (`2026-12-01` ou `2026-12-01T18:00:00Z`), retour après emprunt
- `:id` : entier strictement positif
- `?page=` (≥ 1, défaut 1), `?limite=` (≥ 1, défaut 10, plafonnée à 50), `?disponible=true|false`, `?rendu=true|false`, `?ouvrageId=`

Une entrée invalide renvoie **400** avec la liste des champs fautifs :

```json
{
  "erreur": "Validation échouée",
  "details": [
    { "champ": "body.titre", "message": "Trop petit : chaîne de caractères doit avoir >=1 caractères" },
    { "champ": "body.annee", "message": "doit être inférieure ou égale à 2026" }
  ]
}
```

### Pagination

```json
{
  "donnees": [ ... ],
  "pagination": { "page": 1, "limite": 10, "total": 10, "pages": 1 }
}
```

### Erreurs et journal

- Un gestionnaire d'erreurs unique répond toujours en JSON (`{ "erreur": "..." }`), sans pile d'exécution. Il traduit les erreurs Zod en 400, les erreurs Prisma P2025 en 404 et P2003/P2002 en 409, un JSON mal formé en 400 ; toute autre erreur devient un 500 générique (le détail n'est écrit que dans la console du serveur).
- Une route inconnue renvoie 404.
- Chaque requête produit une ligne de journal : `2026-11-16T10:21:49.884Z DELETE /api/ouvrages/11 409 8.0 ms`.

## Exemples de requêtes

```bash
curl http://localhost:3000/api/ouvrages?disponible=true&limite=5

curl -X POST http://localhost:3000/api/ouvrages \
  -H "Content-Type: application/json" \
  -d '{"titre":"Nana","auteur":"Émile Zola","annee":1880}'

curl -X POST http://localhost:3000/api/emprunts \
  -H "Content-Type: application/json" \
  -d '{"ouvrageId":3,"emprunteur":"Zoé","dateRetourPrevue":"2026-12-07"}'

curl -X POST http://localhost:3000/api/emprunts/4/retour
```

Toutes les routes, cas d'erreur compris, sont dans [`requetes.http`](requetes.http) (extension VS Code « REST Client »).
