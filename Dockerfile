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
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY db ./db
COPY lib ./lib
COPY scripts ./scripts

RUN mkdir -p /app/data/backups /app/data/rdo-fotos

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
