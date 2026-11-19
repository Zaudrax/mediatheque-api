import { z } from "zod";
import { dateReponse } from "./commun.ts";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("doit être une adresse e-mail valide").max(254))
  .meta({ example: "camille@example.net" });

// bcrypt ne prend en compte que les 72 premiers octets : on refuse au-delà.
const motDePasse = z
  .string()
  .min(12, "doit contenir au moins 12 caractères")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, { error: "doit faire au plus 72 octets" })
  .meta({ description: "12 caractères minimum, 72 octets maximum", example: "Membre-Demo-2026!" });

// Le champ « role » n'existe pas dans ce schéma : envoyé par le client, il est ignoré.
export const inscription = z.object({ email, motDePasse }).meta({ id: "Inscription" });

export const connexion = z
  .object({
    email,
    motDePasse: z.string().min(1).max(200).meta({ example: "Membre-Demo-2026!" }),
  })
  .meta({ id: "Connexion" });

export const rafraichissement = z
  .object({ refreshToken: z.string().min(1).max(2000) })
  .meta({ id: "Rafraichissement" });

export type Inscription = z.output<typeof inscription>;
export type Connexion = z.output<typeof connexion>;

// Réponses
export const UtilisateurPublic = z
  .object({
    id: z.number().int(),
    email: z.string(),
    role: z.enum(["membre", "bibliothecaire"]),
    creeLe: dateReponse,
  })
  .meta({ id: "Utilisateur" });

export const Jetons = z
  .object({
    tokenType: z.literal("Bearer"),
    accessToken: z.string().meta({ description: "JWT valable 15 minutes" }),
    refreshToken: z.string().meta({ description: "JWT à usage unique, valable 7 jours" }),
    utilisateur: z.object({
      id: z.number().int(),
      email: z.string(),
      role: z.enum(["membre", "bibliothecaire"]),
    }),
  })
  .meta({ id: "Jetons" });
