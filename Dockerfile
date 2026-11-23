FROM node:22-alpine
WORKDIR /app
COPY server.js entrypoint.sh ./
COPY public ./public
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data && chmod 755 /app/entrypoint.sh && sed -i 's/\r$//' /app/entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
# o entrypoint troca para o usuario "node" quando da (veja entrypoint.sh)
ENTRYPOINT ["/app/entrypoint.sh"]
