/**
 * Erreurs métier de l'API. Le gestionnaire d'erreurs central (middlewares/gestionErreurs.ts)
 * les traduit en réponses JSON avec le bon code HTTP.
 */
export interface DetailErreur {
  champ: string;
  message: string;
}

export class ErreurApi extends Error {
  readonly statut: number;
  readonly details: DetailErreur[] | undefined;
  entetes: Record<string, string> | undefined;

  constructor(statut: number, message: string, details?: DetailErreur[]) {
    super(message);
    this.name = new.target.name;
    this.statut = statut;
    this.details = details;
  }
}

export class RequeteInvalide extends ErreurApi {
  constructor(message = "Requête invalide", details?: DetailErreur[]) {
    super(400, message, details);
  }
}

export class NonAuthentifie extends ErreurApi {
  constructor(message = "Authentification requise") {
    super(401, message);
    this.entetes = { "WWW-Authenticate": 'Bearer realm="mediatheque-api"' };
  }
}

export class Interdit extends ErreurApi {
  constructor(message = "Accès refusé") {
    super(403, message);
  }
}

export class NonTrouve extends ErreurApi {
  constructor(message = "Ressource introuvable") {
    super(404, message);
  }
}

export class Conflit extends ErreurApi {
  constructor(message = "Conflit avec l'état actuel de la ressource") {
    super(409, message);
  }
}

export class ServiceIndisponible extends ErreurApi {
  constructor(message = "Service momentanément indisponible") {
    super(503, message);
  }
}
