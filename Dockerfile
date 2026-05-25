# ── Stage 1: build do bundle React (Vite) ──────────────────────────────
# Roda independente do runtime para não inflar a imagem final com node_modules
# de dev. Quando SERVE_REACT=1 o server.js serve este dist/.
FROM node:20-alpine AS web-builder

WORKDIR /web

COPY web/package*.json ./
RUN npm install

COPY web/ ./
# `npm run build` faz tsc -b && vite build → dist/
RUN npm run build && ls -la dist/

# ── Stage 2: runtime do server.js ─────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY analyze.js ./
COPY index.html ./
COPY manifest.webmanifest ./
COPY sw.js ./
COPY changelog.json ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY db ./db
COPY lib ./lib
COPY routes ./routes
COPY handlers ./handlers
COPY scripts ./scripts

# Bundle React (servido quando SERVE_REACT=1). Sem esta COPY o flag cai no
# fallback legacy silenciosamente (fs.existsSync em server.js).
COPY --from=web-builder /web/dist ./web/dist

RUN mkdir -p /app/data/backups /app/data/rdo-fotos

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
