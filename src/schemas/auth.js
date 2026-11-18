import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email("doit être une adresse e-mail valide").max(254));

// bcrypt ne prend en compte que les 72 premiers octets : on refuse au-delà.
const motDePasse = z
  .string()
  .min(12, "doit contenir au moins 12 caractères")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, { error: "doit faire au plus 72 octets" });

// Le champ « role » n'existe pas dans ce schéma : envoyé par le client, il est ignoré.
export const inscription = z.object({ email, motDePasse });

export const connexion = z.object({
  email,
  motDePasse: z.string().min(1).max(200),
});

export const rafraichissement = z.object({
  refreshToken: z.string().min(1).max(2000),
});
