#!/usr/bin/env bash
# Levanta un Postgres temporal, aplica las migraciones con un stub de Supabase Auth y corre las pruebas de RLS.
# Requiere binarios de Postgres 15+ (initdb, pg_ctl, psql). Uso: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || PGBIN="$(dirname "$(command -v initdb)")"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUNAS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; RUNAS=(runuser -u postgres --); fi
cleanup() { "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"${RUNAS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null
PSQL=("${RUNAS[@]}" "$PGBIN/psql" -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do echo "→ $f"; PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -o /dev/null -f supabase/tests/rls_test.sql 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  //'
exit "${PIPESTATUS[0]}"
