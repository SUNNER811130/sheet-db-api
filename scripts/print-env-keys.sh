#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_EXAMPLE_PATH="${1:-$REPO_ROOT/.env.example}"

if [[ ! -f "$ENV_EXAMPLE_PATH" ]]; then
  echo "File not found: $ENV_EXAMPLE_PATH" >&2
  exit 1
fi

grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' "$ENV_EXAMPLE_PATH" \
  | sed -E 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*/\1/' \
  | grep -v '^GOOGLE_APPLICATION_CREDENTIALS$' \
  | sort -u
