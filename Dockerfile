FROM node:22-alpine AS base

WORKDIR /app

# ─── Install dependencies ────────────────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/

RUN npm ci --workspace=packages/api --workspace=packages/shared --include-workspace-root

# ─── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build

COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/api/ ./packages/api/

# Build shared types first, then the API
RUN npm run build -w packages/shared 2>/dev/null || npx tsc -p packages/shared
RUN npm run build -w packages/api

# ─── Production image ────────────────────────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/

RUN npm ci --workspace=packages/api --workspace=packages/shared --include-workspace-root --omit=dev

COPY --from=build /app/packages/shared/dist/ ./packages/shared/dist/
COPY --from=build /app/packages/api/dist/ ./packages/api/dist/
COPY packages/shared/package.json ./packages/shared/

EXPOSE 3000

CMD ["node", "packages/api/dist/server.js"]
