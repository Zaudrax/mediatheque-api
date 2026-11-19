# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- Construction
FROM node:24-alpine AS construction
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# npm ci lance « prisma generate » (postinstall) : le client est généré dans src/generated.
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------- Exécution
FROM node:24-alpine AS execution
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# Dépendances de production seulement ; le client Prisma compilé est déjà dans dist/.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=construction /app/dist ./dist

# Le processus ne tourne pas en root.
RUN chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/sante" > /dev/null || exit 1

CMD ["node", "dist/index.js"]
