import { z } from "zod";
import { createDocument, type ZodOpenApiOperationObject, type ZodOpenApiResponsesObject } from "zod-openapi";
import { connexion, inscription, Jetons, rafraichissement, UtilisateurPublic } from "../schemas/auth.ts";
import { Erreur, listePaginee, paramsId } from "../schemas/commun.ts";
import { creerEmprunt, Emprunt, listerEmprunts, modifierEmprunt } from "../schemas/emprunts.ts";
import { creerOuvrage, listerOuvrages, modifierOuvrage, Ouvrage } from "../schemas/ouvrages.ts";

const DESCRIPTIONS_ERREURS = {
  400: "Entrée invalide : la liste des champs fautifs figure dans details",
  401: "Jeton d'accès manquant, invalide ou expiré",
  403: "Rôle insuffisant (ou origine CORS non autorisée)",
  404: "Ressource introuvable ou hors de votre portée",
  409: "Conflit avec l'état actuel de la ressource",
  413: "Corps de requête supérieur à 100 Ko",
  429: "Trop de requêtes : limite de débit atteinte",
} as const;

type CodeErreur = keyof typeof DESCRIPTIONS_ERREURS;

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const reponses = (
  succes: Record<string, { description: string; content?: Record<string, { schema: z.ZodType }> }>,
  ...codes: CodeErreur[]
): ZodOpenApiResponsesObject => ({
  ...succes,
  ...Object.fromEntries(codes.map((c) => [String(c), json(Erreur, DESCRIPTIONS_ERREURS[c])])),
});

const corps = (schema: z.ZodType) => ({ required: true, content: { "application/json": { schema } } });
const securise = { security: [{ bearerAuth: [] }] };
const sansContenu = (description: string) => ({ [204]: { description } });

const op = (operation: ZodOpenApiOperationObject): ZodOpenApiOperationObject => operation;

const Sante = z.object({ statut: z.string(), baseDeDonnees: z.string() }).meta({ id: "Sante" });

/** Spécification OpenAPI 3.1 générée depuis les schémas Zod qui valident les requêtes. */
export function genererSpecification() {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "API de la médiathèque",
      version: "1.0.0",
      description:
        "Catalogue et emprunts de la médiathèque associative.\n\n" +
        "Authentification : `POST /api/auth/connexion` renvoie un access token (15 min) à envoyer " +
        "dans l'en-tête `Authorization: Bearer <jeton>`, et un refresh token à usage unique " +
        "pour `POST /api/auth/rafraichir`.\n\n" +
        "Rôles : **membre** (catalogue en lecture, ses propres emprunts) et " +
        "**bibliothecaire** (gestion du catalogue et de tous les emprunts).",
    },
    servers: [{ url: "/", description: "Serveur courant" }],
    tags: [
      { name: "Santé" },
      { name: "Authentification" },
      { name: "Ouvrages" },
      { name: "Emprunts" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    paths: {
      "/sante": {
        get: op({
          tags: ["Santé"],
          summary: "État de l'API et de la base de données",
          responses: {
            200: json(Sante, "API et base opérationnelles"),
            503: json(Sante, "Base de données injoignable"),
          },
        }),
      },

      // ------------------------------------------------------------ Authentification
      "/api/auth/inscription": {
        post: op({
          tags: ["Authentification"],
          summary: "Créer un compte membre",
          description: "Le rôle est toujours « membre » ; un champ role envoyé est ignoré. Limité à 10 requêtes par quart d'heure sur /api/auth.",
          requestBody: corps(inscription),
          responses: reponses({ 201: json(UtilisateurPublic, "Compte créé") }, 400, 409, 429),
        }),
      },
      "/api/auth/connexion": {
        post: op({
          tags: ["Authentification"],
          summary: "Se connecter",
          description: "Même réponse 401 que le compte existe ou non.",
          requestBody: corps(connexion),
          responses: reponses({ 200: json(Jetons, "Jetons émis") }, 400, 401, 429),
        }),
      },
      "/api/auth/rafraichir": {
        post: op({
          tags: ["Authentification"],
          summary: "Échanger un refresh token contre une nouvelle paire",
          description: "Rotation : le refresh token présenté est révoqué. Le rejouer révoque tous les jetons du compte.",
          requestBody: corps(rafraichissement),
          responses: reponses({ 200: json(Jetons, "Nouvelle paire de jetons") }, 400, 401, 429),
        }),
      },
      "/api/auth/deconnexion": {
        post: op({
          tags: ["Authentification"],
          summary: "Se déconnecter (révoque tous les refresh tokens)",
          ...securise,
          responses: reponses(sansContenu("Refresh tokens révoqués"), 401, 429),
        }),
      },

      // ------------------------------------------------------------ Ouvrages
      "/api/ouvrages": {
        get: op({
          tags: ["Ouvrages"],
          summary: "Lister le catalogue",
          ...securise,
          requestParams: { query: listerOuvrages },
          responses: reponses({ 200: json(listePaginee(Ouvrage), "Page d'ouvrages") }, 400, 401),
        }),
        post: op({
          tags: ["Ouvrages"],
          summary: "Ajouter un ouvrage (bibliothécaire)",
          ...securise,
          requestBody: corps(creerOuvrage),
          responses: reponses({ 201: json(Ouvrage, "Ouvrage créé") }, 400, 401, 403),
        }),
      },
      "/api/ouvrages/{id}": {
        get: op({
          tags: ["Ouvrages"],
          summary: "Détail d'un ouvrage et de ses emprunts en cours",
          description: "Un membre ne voit que ses propres emprunts en cours.",
          ...securise,
          requestParams: { path: paramsId },
          responses: reponses(
            { 200: json(Ouvrage.extend({ emprunts: z.array(Emprunt.omit({ ouvrage: true, emprunteur: true })) }), "Ouvrage") },
            400,
            401,
            404,
          ),
        }),
        patch: op({
          tags: ["Ouvrages"],
          summary: "Modifier un ouvrage (bibliothécaire)",
          ...securise,
          requestParams: { path: paramsId },
          requestBody: corps(modifierOuvrage),
          responses: reponses({ 200: json(Ouvrage, "Ouvrage modifié") }, 400, 401, 403, 404),
        }),
        delete: op({
          tags: ["Ouvrages"],
          summary: "Retirer un ouvrage du catalogue (bibliothécaire)",
          description:
            "409 si l'ouvrage est emprunté. Sans historique, il est supprimé définitivement ; " +
            "avec un historique d'emprunts, il est archivé : il disparaît du catalogue " +
            "(404 ensuite) et son historique reste consultable.",
          ...securise,
          requestParams: { path: paramsId },
          responses: reponses(sansContenu("Ouvrage supprimé ou archivé"), 400, 401, 403, 404, 409),
        }),
      },

      // ------------------------------------------------------------ Emprunts
      "/api/emprunts": {
        get: op({
          tags: ["Emprunts"],
          summary: "Lister les emprunts (les siens pour un membre, tous pour un bibliothécaire)",
          ...securise,
          requestParams: { query: listerEmprunts },
          responses: reponses({ 200: json(listePaginee(Emprunt), "Page d'emprunts") }, 400, 401),
        }),
        post: op({
          tags: ["Emprunts"],
          summary: "Emprunter un ouvrage disponible",
          description: "Un membre emprunte pour lui-même. L'ouvrage devient indisponible dans la même transaction ; s'il ne l'est pas, 409 sans rien écrire.",
          ...securise,
          requestBody: corps(creerEmprunt),
          responses: reponses({ 201: json(Emprunt, "Emprunt créé") }, 400, 401, 404, 409),
        }),
      },
      "/api/emprunts/{id}": {
        get: op({
          tags: ["Emprunts"],
          summary: "Détail d'un emprunt",
          ...securise,
          requestParams: { path: paramsId },
          responses: reponses({ 200: json(Emprunt, "Emprunt") }, 400, 401, 404),
        }),
        patch: op({
          tags: ["Emprunts"],
          summary: "Modifier les dates d'un emprunt",
          description: "Le propriétaire et l'ouvrage ne sont pas modifiables.",
          ...securise,
          requestParams: { path: paramsId },
          requestBody: corps(modifierEmprunt),
          responses: reponses({ 200: json(Emprunt, "Emprunt modifié") }, 400, 401, 404),
        }),
        delete: op({
          tags: ["Emprunts"],
          summary: "Supprimer un emprunt (bibliothécaire)",
          ...securise,
          requestParams: { path: paramsId },
          responses: reponses(sansContenu("Emprunt supprimé"), 400, 401, 403, 404),
        }),
      },
      "/api/emprunts/{id}/retour": {
        post: op({
          tags: ["Emprunts"],
          summary: "Rendre un ouvrage",
          description: "L'ouvrage redevient disponible dans la même transaction. 409 si l'emprunt est déjà rendu.",
          ...securise,
          requestParams: { path: paramsId },
          responses: reponses({ 200: json(Emprunt, "Emprunt rendu") }, 400, 401, 404, 409),
        }),
      },
    },
  });
}
