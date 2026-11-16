/**
 * Erreurs métier de l'API. Le gestionnaire d'erreurs central (middlewares/gestionErreurs.js)
 * les traduit en réponses JSON avec le bon code HTTP.
 */
export class ErreurApi extends Error {
  constructor(statut, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.statut = statut;
    this.details = details;
  }
}

export class RequeteInvalide extends ErreurApi {
  constructor(message = "Requête invalide", details) {
    super(400, message, details);
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
