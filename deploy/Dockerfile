# One file, three images: docker build --target api|web|admin -f deploy/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @jafson/api exec prisma generate

FROM base AS api
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["pnpm", "--filter", "@jafson/api", "start"]

# The /api proxy target is fixed at build time by Next.js, so it is a build argument.
FROM base AS web-build
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @jafson/web build
FROM web-build AS web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@jafson/web", "start"]

FROM base AS admin-build
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @jafson/admin build
FROM admin-build AS admin
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@jafson/admin", "start"]
