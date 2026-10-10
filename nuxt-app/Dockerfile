FROM node:22.23.1-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@10.24.0

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm rebuild better-sqlite3 esbuild
COPY . ./
RUN rm -rf .nuxt .output \
  && pnpm exec nuxt prepare \
  && NODE_OPTIONS=--max-old-space-size=4096 DISCOVERYSTACK_SKIP_PRERENDER=1 pnpm run build \
  && grep -R -q 'nitro-public-intelligence-20260818-r17-immutable-readiness-ssr' .output/server

FROM node:22.23.1-bookworm-slim AS runtime
ARG DISCOVERYSTACK_BUILD_COMMIT
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    PORT=3000 \
    DISCOVERYSTACK_BUILD_COMMIT=${DISCOVERYSTACK_BUILD_COMMIT}
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
RUN mkdir -p .data && chown node:node .data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node --input-type=module -e "const r = await fetch('http://127.0.0.1:' + (process.env.NITRO_PORT || process.env.PORT || '3000') + '/api/health', { signal: AbortSignal.timeout(4000) }); const b = await r.json(); process.exit(r.ok && b.status === 'ok' ? 0 : 1)"
CMD ["node", ".output/server/index.mjs"]
