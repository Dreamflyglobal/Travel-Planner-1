#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Dream Fly Global — Production startup script
#
# Use this as the entrypoint on DigitalOcean (App Platform or Droplet + PM2).
# It runs schema migrations first, then starts the API server.
#
# Required environment variable:
#   DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
#
# DigitalOcean App Platform — set in the App Spec:
#   run_command: bash scripts/start-production.sh
#
# DigitalOcean Droplet (PM2) — ecosystem.config.js:
#   script: "scripts/start-production.sh"
#   interpreter: "bash"
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Dream Fly Global — Production Boot"
echo "══════════════════════════════════════════════════════"
echo ""

# 1. Verify DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌  DATABASE_URL is not set. Cannot start."
  exit 1
fi
echo "✅  DATABASE_URL is configured."
echo ""

# 2. Run database migrations (idempotent — safe to run on every deploy)
echo "▶  Running database migrations…"
pnpm db:migrate
echo ""

# 3. (Optional) Seed default data on first boot
#    Uncomment the next line to seed on every deploy (safe — uses ON CONFLICT DO NOTHING):
# pnpm db:seed

# 4. Start the API server
echo "▶  Starting API server…"
echo ""
exec node artifacts/api-server/dist/index.mjs
