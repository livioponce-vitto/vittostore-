# syntax=docker/dockerfile:1.7
# Multi-stage build para VittoStore Shopify App

# ── Stage 1: dependencies ─────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 2: runtime ──────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Tini para signal handling (PID 1 limpio)
RUN apk add --no-cache tini wget

# Usuario no-root
RUN addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_LOGLEVEL=warn

COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json server.js ./
COPY --chown=app:app app ./app
COPY --chown=app:app public ./public
COPY --chown=app:app config ./config

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]