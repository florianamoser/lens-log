# syntax=docker/dockerfile:1

# Compile the architecture-neutral web assets on the builder's native CPU.
# This avoids running emulated target-architecture tooling during cross-builds.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN pnpm run build

# Docker resolves this stage to the requested target architecture. The runtime
# consists only of portable JavaScript and the matching official Node image.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=6464 DATA_DIR=/data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 6464
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:6464/api/health || exit 1
CMD ["node", "server/server.mjs"]
