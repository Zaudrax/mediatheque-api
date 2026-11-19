/** Un message de la conversation conservée en mémoire. */
export interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Un outil mis à disposition du modèle. Il est construit pour un utilisateur donné
 * (fermeture) : le modèle ne choisit jamais l'identifiant de l'utilisateur.
 */
export interface Outil {
  nom: string;
  description: string;
  /** Schéma JSON des arguments, communiqué au modèle. */
  parametres: Record<string, unknown>;
  /** Valide les arguments fournis par le modèle puis exécute l'outil. */
  executer(args: unknown): Promise<unknown>;
}

export type EvenementIa =
  | { type: "texte"; delta: string }
  | { type: "outil"; nom: string }
  | { type: "jetons"; entree: number; sortie: number };

export interface RequeteIa {
  instructions: string;
  historique: Message[];
  question: string;
  outils: Outil[];
  signal: AbortSignal;
}

/** Implémentations interchangeables : OpenAI ou bouchon (tests, développement sans clé). */
export interface FournisseurIa {
  readonly nom: "openai" | "bouchon";
  repondreEnFlux(requete: RequeteIa): AsyncGenerator<EvenementIa>;
}
