#!/usr/bin/env bash
set -euo pipefail

SERVICE="sheet-db-api-dev"
REGION="asia-east1"
PROJECT=""
UID_VALUE="${UID:-U_SMOKE_CLOUD}"

usage() {
  cat <<'USAGE'
Usage: scripts/cloud/smoke-cloud.sh [--service SERVICE] [--region REGION] [--project PROJECT] [--uid UID]

Run smoke test against Cloud Run URL via scripts/smoke.js --no-auto-start.
Required env:
  API_KEY
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      SERVICE="${2:-}"
      shift 2
      ;;
    --region)
      REGION="${2:-}"
      shift 2
      ;;
    --project)
      PROJECT="${2:-}"
      shift 2
      ;;
    --uid)
      UID_VALUE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${API_KEY:-}" ]]; then
  echo "Missing required env var: API_KEY" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
run_url_args=(--service "$SERVICE" --region "$REGION")
if [[ -n "$PROJECT" ]]; then
  run_url_args+=(--project "$PROJECT")
fi
RUN_URL="$("$SCRIPT_DIR/get-run-url.sh" "${run_url_args[@]}")"

node scripts/smoke.js --no-auto-start --base "$RUN_URL" --uid "$UID_VALUE" --apiKey "$API_KEY"
