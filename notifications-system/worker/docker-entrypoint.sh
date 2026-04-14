#!/bin/sh
set -eu

if [ "${RUN_PRISMA_DB_PUSH:-true}" = "true" ]; then
  echo "Running prisma db push..."
  npx prisma db push --skip-generate
fi

exec "$@"
