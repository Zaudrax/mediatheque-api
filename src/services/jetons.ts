import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { ConfigJwt } from "../config.ts";
import type { UtilisateurConnecte } from "../types/domaine.ts";

const ALGORITHME = "HS256";
const ROLES = new Set(["membre", "bibliothecaire"]);

/** Access token : courte durée, porte l'identifiant (sub) et le rôle. */
export function signerAccess(jwt: ConfigJwt, utilisateur: UtilisateurConnecte): Promise<string> {
  return new SignJWT({ role: utilisateur.role })
    .setProtectedHeader({ alg: ALGORITHME, typ: "JWT" })
    .setSubject(String(utilisateur.id))
    .setIssuer(jwt.emetteur)
    .setAudience(jwt.audience)
    .setIssuedAt()
    .setExpirationTime(jwt.dureeAccess)
    .sign(jwt.secretAccess);
}

/** Lève une erreur si la signature, l'émetteur, l'audience, l'expiration ou le contenu ne conviennent pas. */
export async function verifierAccess(jwt: ConfigJwt, jeton: string): Promise<UtilisateurConnecte> {
  const { payload } = await jwtVerify(jeton, jwt.secretAccess, {
    algorithms: [ALGORITHME],
    issuer: jwt.emetteur,
    audience: jwt.audience,
    requiredClaims: ["sub", "exp"],
  });
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || typeof payload.role !== "string" || !ROLES.has(payload.role)) {
    throw new Error("Contenu du jeton inattendu");
  }
  return { id, role: payload.role as UtilisateurConnecte["role"] };
}

/**
 * Refresh token : signé avec un secret distinct, identifié par un jti unique.
 * Seul ce jti est enregistré en base, ce qui permet de le révoquer.
 */
export async function signerRefresh(jwt: ConfigJwt, utilisateurId: number) {
  const jti = randomUUID();
  const expireLe = new Date(Date.now() + jwt.dureeRefreshJours * 24 * 60 * 60 * 1000);
  const jeton = await new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: ALGORITHME, typ: "JWT" })
    .setSubject(String(utilisateurId))
    .setJti(jti)
    .setIssuer(jwt.emetteur)
    .setAudience(jwt.audience)
    .setIssuedAt()
    .setExpirationTime(expireLe)
    .sign(jwt.secretRefresh);
  return { jeton, jti, expireLe };
}

export async function verifierRefresh(jwt: ConfigJwt, jeton: string) {
  const { payload } = await jwtVerify(jeton, jwt.secretRefresh, {
    algorithms: [ALGORITHME],
    issuer: jwt.emetteur,
    audience: jwt.audience,
    requiredClaims: ["sub", "jti", "exp"],
  });
  const utilisateurId = Number(payload.sub);
  if (payload.typ !== "refresh" || !payload.jti || !Number.isInteger(utilisateurId)) {
    throw new Error("Type de jeton inattendu");
  }
  return { utilisateurId, jti: payload.jti };
}
