import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

const ALGORITHME = "HS256";

/** Access token : courte durée, porte l'identifiant (sub) et le rôle. */
export function signerAccess(jwt, utilisateur) {
  return new SignJWT({ role: utilisateur.role })
    .setProtectedHeader({ alg: ALGORITHME, typ: "JWT" })
    .setSubject(String(utilisateur.id))
    .setIssuer(jwt.emetteur)
    .setAudience(jwt.audience)
    .setIssuedAt()
    .setExpirationTime(jwt.dureeAccess)
    .sign(jwt.secretAccess);
}

/** Lève une erreur jose si la signature, l'émetteur, l'audience ou l'expiration ne conviennent pas. */
export async function verifierAccess(jwt, jeton) {
  const { payload } = await jwtVerify(jeton, jwt.secretAccess, {
    algorithms: [ALGORITHME],
    issuer: jwt.emetteur,
    audience: jwt.audience,
    requiredClaims: ["sub", "exp"],
  });
  return { id: Number(payload.sub), role: payload.role };
}

/**
 * Refresh token : signé avec un secret distinct, identifié par un jti unique.
 * Seul ce jti est enregistré en base, ce qui permet de le révoquer.
 */
export async function signerRefresh(jwt, utilisateurId) {
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

export async function verifierRefresh(jwt, jeton) {
  const { payload } = await jwtVerify(jeton, jwt.secretRefresh, {
    algorithms: [ALGORITHME],
    issuer: jwt.emetteur,
    audience: jwt.audience,
    requiredClaims: ["sub", "jti", "exp"],
  });
  if (payload.typ !== "refresh") throw new Error("Type de jeton inattendu");
  return { utilisateurId: Number(payload.sub), jti: payload.jti };
}
