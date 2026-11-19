import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { genererSpecification } from "../docs/openapi.ts";

/** /api/docs : Swagger UI ; /api/docs.json : la spécification OpenAPI 3.1 brute. Publics. */
export function routeurDocs(): Router {
  const routeur = Router();
  const specification = genererSpecification();

  routeur.get("/docs.json", (_req, res) => {
    res.json(specification);
  });
  routeur.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(specification, {
      customSiteTitle: "API de la médiathèque",
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  return routeur;
}
