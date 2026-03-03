#!/usr/bin/env bash
set -euo pipefail

SERVICE="sheet-db-api-dev"
REGION="asia-east1"
PROJECT=""
MODE="env"

usage() {
  cat <<'USAGE'
Usage: scripts/cloud/deploy-dev.sh [--mode env|source] [--service SERVICE] [--region REGION] [--project PROJECT]

Modes:
  env    Only update Cloud Run env vars via scripts/cloud/set-env-dev.sh (default)
  source Deploy source to Cloud Run via gcloud run deploy --source . (no secrets)

To deploy source, you must pass: --mode source
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
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

if [[ -z "$PROJECT" ]]; then
  PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
fi

if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "Missing gcloud project. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$MODE" in
  env)
    "$SCRIPT_DIR/set-env-dev.sh" --service "$SERVICE" --region "$REGION" --project "$PROJECT"
    ;;
  source)
    gcloud run deploy "$SERVICE" \
      --source . \
      --region "$REGION" \
      --project "$PROJECT" \
      --quiet
    ;;
  *)
    echo "Invalid --mode: $MODE (expected env|source)" >&2
    exit 2
    ;;
esac
