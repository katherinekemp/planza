# Build from the repo root:  docker build -f apps/api/Dockerfile -t planza-api .

# ---- Build stage: install everything and bundle the API into plain JS ----
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
# Copy only the manifests first so the dependency layer is cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @planza/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @planza/api build

# ---- Runtime stage: just Node, the bundle, and the SQL migrations ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 MIGRATIONS_DIR=/app/drizzle
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "--enable-source-maps", "dist/server.js"]
