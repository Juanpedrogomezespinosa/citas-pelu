# syntax=docker/dockerfile:1
# API de la peluquería: build en dos etapas, imagen final mínima y sin root.

# ---- Etapa 1: compilar TypeScript -----------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Etapa 2: solo dependencias de producción + código compilado -----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# tini: reenvía SIGTERM al proceso Node para el cierre ordenado (server.ts)
RUN apk add --no-cache tini

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# Aplica las migraciones pendientes y arranca (idempotente en cada despliegue)
CMD ["sh", "-c", "node dist/db/migrate.js latest && node dist/server.js"]
