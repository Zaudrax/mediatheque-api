import { creerApp } from "./app.ts";
import { lireConfig } from "./config.ts";
import { prisma } from "./db.ts";

const config = lireConfig();
const app = creerApp(config);

// En Express 5, une erreur d'écoute (port déjà pris…) est passée au callback.
const serveur = app.listen(config.port, (err) => {
  if (err) {
    console.error(`Impossible d'écouter sur le port ${config.port} : ${err.message}`);
    process.exit(1);
  }
  console.log(
    `API médiathèque à l'écoute sur http://localhost:${config.port} (assistant : ${config.ia.fournisseur}, documentation : /api/docs)`,
  );
});

function arreter(signal: NodeJS.Signals): void {
  console.log(`${signal} reçu, arrêt en cours…`);
  serveur.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", arreter);
process.on("SIGTERM", arreter);
