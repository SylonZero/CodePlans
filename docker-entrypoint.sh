#!/bin/sh
set -e

# Listen on all interfaces. Some platforms set HOSTNAME to the machine name,
# which Next.js would otherwise bind to.
export HOSTNAME="${BIND_ADDRESS:-0.0.0.0}"

# Volumes (Fly.io, Railway, docker -v) are mounted root-owned: make the data
# directory writable for the unprivileged node user, then drop privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown -R node:node "${DATA_DIR:-/data}"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
