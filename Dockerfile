# ── Runtime do server.js ──────────────────────────────────────────────
# Base Debian (não Alpine): necessária para o LibreOffice headless, usado
# para gerar o PDF do RDO idêntico ao formulário oficial Passarelli
# (lib/office-convert.js converte o template .xlsx preenchido → PDF).
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

# LibreOffice (apenas Calc) + fontes: Carlito (métricas da Calibri) e Liberation.
# --no-install-recommends mantém a imagem o menor possível.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       libreoffice-calc fonts-crosextra-carlito fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

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

RUN mkdir -p /app/data/backups /app/data/rdo-fotos

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
