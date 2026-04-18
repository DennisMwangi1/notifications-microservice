#!/bin/sh
set -eu

wait_for_db() {
  if [ -z "${DB_URL:-}" ]; then
    echo "DB_URL is not set; skipping database wait."
    return 0
  fi

  echo "Waiting for database to accept connections..."
  attempts=0
  max_attempts="${DB_CONNECT_MAX_ATTEMPTS:-30}"
  delay_seconds="${DB_CONNECT_RETRY_DELAY_SECONDS:-2}"

  while [ "$attempts" -lt "$max_attempts" ]; do
    if DB_URL="$DB_URL" node -e "
const net = require('net');

const databaseUrl = process.env.DB_URL;
const parsed = new URL(databaseUrl);
const host = parsed.hostname;
const port = Number(parsed.port || 5432);

const socket = net.connect({ host, port });
const timeout = setTimeout(() => {
  socket.destroy();
  process.exit(1);
}, 2000);

socket.on('connect', () => {
  clearTimeout(timeout);
  socket.end();
  process.exit(0);
});

socket.on('error', () => {
  clearTimeout(timeout);
  process.exit(1);
});
"; then
      echo "Database is reachable."
      return 0
    fi

    attempts=$((attempts + 1))
    echo "Database not ready yet (${attempts}/${max_attempts}); retrying in ${delay_seconds}s..."
    sleep "$delay_seconds"
  done

  echo "Database did not become reachable after ${max_attempts} attempts."
  return 1
}

if [ "${RUN_PRISMA_DB_PUSH:-true}" = "true" ]; then
  wait_for_db
  if [ "${PRISMA_FORCE_RESET:-false}" = "true" ]; then
    echo "Running prisma db push with --force-reset..."
    npx prisma db push --force-reset
  else
    echo "Running prisma db push..."
    npx prisma db push
  fi
fi

exec "$@"
