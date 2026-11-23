#!/bin/sh
# Docker comum: o container entra como root, acerta o dono da pasta de dados (o volume ./data costuma
# nascer com dono root no host) e roda o servidor como o usuario "node".
# udocker / podman rootless: nao ha root de verdade e o "su" falha; ai roda direto com o usuario atual.
D="${DATA_DIR:-/data}"
mkdir -p "$D" 2>/dev/null
if [ "$(id -u)" = 0 ] && su node -s /bin/sh -c true 2>/dev/null; then
  chown -R node:node "$D" 2>/dev/null
  exec su node -s /bin/sh -c 'exec node /app/server.js'
fi
exec node /app/server.js
