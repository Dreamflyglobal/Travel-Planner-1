#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Dream Fly Global — Production startup script
#
# Use as the entrypoint for:
#   • DigitalOcean App Platform  →  Run Command: bash scripts/start-production.sh
#   • Plain bash on a DO Droplet →  bash scripts/start-production.sh
#
# For PM2 on a Droplet, use ecosystem.config.cjs instead — it handles env
# loading and process supervision automatically.
#
# Required: DATABASE_URL must be set before this script runs, either via:
#   1. A .env file in the project root  (loaded automatically below)
#   2. Platform environment variables   (DO App Platform, systemd, etc.)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── 1. Load .env from project root if it exists ──────────────────────────────
#      Handles comments and blank lines; exports all KEY=VALUE pairs.
if [ -f ".env" ]; then
  echo "📄  Loading .env from project root…"
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Dream Fly Global — Production Boot"
echo "══════════════════════════════════════════════════════"
echo ""

# ── 2. Verify DATABASE_URL ────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌  DATABASE_URL is not set."
  echo "    Set it in .env or as a platform environment variable."
  exit 1
fi
echo "✅  DATABASE_URL is configured."
echo ""

# ── 3. Run database migrations (idempotent — safe on every deploy) ────────────
echo "▶   Running database migrations…"
pnpm db:migrate
echo ""

# ── 4. (Optional) Seed default data ──────────────────────────────────────────
#       Uncomment on first deploy to pre-populate settings, counters, etc.
#       Safe to run repeatedly (uses ON CONFLICT DO NOTHING).
# pnpm db:seed

# ── 5. Start the API server ───────────────────────────────────────────────────
echo "▶   Starting API server on port ${PORT:-3000}…"
echo ""
exec node artifacts/api-server/dist/index.mjs
