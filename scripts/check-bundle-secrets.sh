#!/usr/bin/env bash
# SEC-02 / threat T-1-01 — fail if a Supabase secret leaks into the client bundle.
#
# After `next build`, the browser bundle lives in `.next/static`. Anything there
# is world-readable. This gate greps that tree for secret markers and exits
# non-zero if any real (non-comment) match is found.
#
# Contract:
#   - exit 0 if `.next/static` is MISSING (nothing built yet) OR clean
#   - exit 1 if a secret marker appears on a non-comment line
#
# It goes green for real once Wave 3 builds the client; until then the absence of
# `.next/static` (or a clean tree) is a passing state.

set -euo pipefail

STATIC_DIR="${1:-.next/static}"

# Markers that must never reach the client bundle.
PATTERNS='sb_secret_|service_role|SUPABASE_SECRET_KEY'

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "check-bundle-secrets: '$STATIC_DIR' not present — nothing to scan (pass)."
  exit 0
fi

# Grep recursively. Strip shell/JS-style comment-only lines before counting so a
# benign comment can never gate the build. Never gate on an unfiltered count.
matches="$(grep -rInE "$PATTERNS" "$STATIC_DIR" 2>/dev/null | grep -vE '^[^:]*:[0-9]+:[[:space:]]*(//|#|\*)' || true)"

if [[ -n "$matches" ]]; then
  echo "check-bundle-secrets: SECRET MARKER FOUND in $STATIC_DIR (SEC-02 violation):" >&2
  echo "$matches" >&2
  exit 1
fi

echo "check-bundle-secrets: no secret markers in $STATIC_DIR (pass)."
exit 0
