#!/usr/bin/env bash
# Applies the shim, every migration, the seed and the isolation suite to a clean
# database. Intended for a plain pgvector Postgres container; on real Supabase use
# `supabase db reset` and skip the shim.
set -e
psql -U postgres -q -c "drop schema if exists public cascade; drop schema if exists app cascade; drop schema if exists tests cascade; drop schema if exists storage cascade; drop schema if exists auth cascade; drop schema if exists extensions cascade; create schema public;" >/dev/null
psql -U postgres -v ON_ERROR_STOP=1 -q -f /sql/tests/00_shim_supabase.sql
for f in /sql/migrations/0*.sql; do psql -U postgres -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -U postgres -v ON_ERROR_STOP=1 -q -f /sql/tests/01_seed.sql
psql -U postgres -v ON_ERROR_STOP=1 -f /sql/tests/02_isolation.sql
psql -U postgres -v ON_ERROR_STOP=1 -f /sql/tests/03_webhook_sync.sql
psql -U postgres -v ON_ERROR_STOP=1 -f /sql/tests/04_billing.sql
