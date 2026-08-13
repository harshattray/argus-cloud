#!/usr/bin/env bash
#
# Disposable local Postgres for the checks a shared server can prove and PGlite
# cannot — chiefly `test/migrations.test.mjs` M7/M7b, which cold-start 20
# separate processes against one database to exercise `pg_advisory_xact_lock`
# across real backends. In-memory PGlite gives every process its own private
# database, so that test is meaningless there and skips itself.
#
#   scripts/test-db.sh start          # boot it; prints DATABASE_URL
#   scripts/test-db.sh stop           # shut it down
#   scripts/test-db.sh url            # print DATABASE_URL
#
#   DATABASE_URL="$(scripts/test-db.sh start)" npm test
#
# Requires: brew install postgresql@17
#
# Nothing here touches the Homebrew default cluster or installs a login
# service. The data directory is disposable — delete it and this re-creates it.
set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DATA_DIR="${NORMA_TESTDB_DIR:-/tmp/normascope-testdb}"
PORT="${NORMA_TESTDB_PORT:-55432}"
DB_NAME=normascope_test
URL="postgres://postgres@127.0.0.1:${PORT}/${DB_NAME}"

# Must stay short and must not be the data directory: Postgres caps the
# Unix-domain socket path at 103 bytes, and the scratchpad paths this repo is
# often built under blow straight past that.
SOCKET_DIR=/tmp/nspg

# Without this the postmaster exits at startup on macOS with "postmaster became
# multithreaded during startup" — Homebrew's own caveat calls this out.
export LC_ALL="en_US.UTF-8"
export PATH="$PG_BIN:$PATH"

if ! command -v pg_ctl >/dev/null 2>&1; then
  echo "pg_ctl not found in $PG_BIN — run: brew install postgresql@17" >&2
  exit 1
fi

case "${1:-}" in
  start)
    mkdir -p "$SOCKET_DIR"
    [ -d "$DATA_DIR/base" ] || initdb -D "$DATA_DIR" --locale=en_US.UTF-8 -E UTF-8 -U postgres >/dev/null
    if ! pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then
      pg_ctl -D "$DATA_DIR" -o "-p $PORT -k $SOCKET_DIR" -l "$DATA_DIR/server.log" start >/dev/null
    fi
    for _ in $(seq 1 40); do
      psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tAc 'SELECT 1' >/dev/null 2>&1 && break
      sleep 0.25
    done
    createdb -h 127.0.0.1 -p "$PORT" -U postgres "$DB_NAME" 2>/dev/null || true
    echo "$URL"
    ;;
  stop)
    pg_ctl -D "$DATA_DIR" stop >/dev/null 2>&1 || true
    echo "stopped" >&2
    ;;
  url)
    echo "$URL"
    ;;
  *)
    echo "usage: $0 {start|stop|url}" >&2
    exit 1
    ;;
esac
