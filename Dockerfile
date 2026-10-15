FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends rsync ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production TZ=Europe/Budapest
WORKDIR /app
COPY package.json package-lock.json ./
# Optional build-only trust certificate for workstations with HTTPS inspection.
# Never disables TLS verification and never installs that certificate in the image.
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm ci --omit=dev --ignore-scripts; \
    else npm ci --omit=dev --ignore-scripts; fi && npm cache clean --force
COPY server.mjs ./
COPY lib ./lib
COPY public ./public
COPY test ./test
EXPOSE 9899
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:9899/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

LABEL org.opencontainers.image.source="https://github.com/MarlonMarketing/backup-impresa" org.opencontainers.image.licenses="MIT" org.opencontainers.image.version="0.1.2"
