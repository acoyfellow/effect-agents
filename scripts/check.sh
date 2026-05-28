#!/usr/bin/env bash
# Repo-wide pre-flight: typecheck + biome (warnings only, doesn't gate).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ typecheck"
bun run typecheck

echo "→ probes (local, requires OPENROUTER_API_KEY / OPENAI_API_KEY / CLOUDFLARE_*)"
if [ -n "${OPENROUTER_API_KEY:-}" ] || [ -n "${OPENAI_API_KEY:-}" ] || ([ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]); then
  bun run probe:all
else
  echo "  (skip — no provider creds in env)"
fi

echo "✅ check passed"
