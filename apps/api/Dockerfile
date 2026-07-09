# Harbourstay API — production image.
#
# Build from the REPO ROOT (the pnpm workspace is the build context):
#   docker build -f apps/api/Dockerfile -t harbourstay-api .
#
# AWS App Runner runs x86_64 only. On Apple Silicon you MUST cross-build:
#   docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t harbourstay-api .
#
# Debian (-slim) rather than Alpine on purpose: `bcrypt` is a native module and
# Prisma's query engine needs glibc + OpenSSL 3. Prisma generates an engine that
# matches the image it is generated on, so `prisma generate` runs on this same
# base — never copy a generated client in from a different distro.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
# openssl: Prisma query engine. ca-certificates: outbound TLS to the Stripe API.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app


# ---- manifests: just enough to resolve the workspace graph, for layer caching -
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Every workspace manifest must exist or pnpm cannot resolve the graph.
COPY apps/api/package.json          apps/api/
COPY apps/web/package.json          apps/web/
COPY packages/shared/package.json   packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
# `@harbourstay/api` has a `postinstall: prisma generate`, so the schema has to be
# on disk *before* any install runs.
COPY apps/api/prisma apps/api/prisma


# ---- build: full install (incl. devDeps), compile shared then api ------------
FROM manifests AS build
# Toolchain for building `bcrypt` from source when no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# `--filter=@harbourstay/api...` = the api plus everything it depends on, so the
# web app's (large) dependency tree is never downloaded.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter=@harbourstay/api...

COPY packages/ packages/
COPY apps/api/ apps/api/

# `@harbourstay/shared` resolves to ./dist/index.js, so it must be compiled first.
RUN pnpm --filter @harbourstay/shared build
RUN pnpm --filter @harbourstay/api build


# ---- prod-deps: a SEPARATE, production-only node_modules ---------------------
# Deliberately not `pnpm prune --prod` on the build stage: prune wipes node_modules
# and reinstalls, which silently yields an empty tree without the store cache mount.
FROM manifests AS prod-deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
# `prisma` is a runtime dependency (not a devDep) so this install regenerates the
# client, and so the running container can execute `prisma migrate deploy` itself.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter=@harbourstay/api...


# ---- runner: the shipped image ----------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# App Runner's default ingress port. Override with -e PORT=… locally.
ENV PORT=8080

# Workspace root files (pnpm's symlinks are relative; the layout must be preserved).
COPY --from=prod-deps --chown=node:node /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules

# Compiled output + the schema (needed by `prisma migrate deploy` and the client).
COPY --from=build --chown=node:node /app/apps/api/dist        ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/prisma       ./apps/api/prisma
COPY --from=build --chown=node:node /app/packages/shared/dist         ./packages/shared/dist
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json

USER node
EXPOSE 8080

# `migrate deploy` is idempotent and takes a Postgres advisory lock, so it is safe
# to run on every container start (and with more than one instance).
CMD ["sh", "-c", "apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
