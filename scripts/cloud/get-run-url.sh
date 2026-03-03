#!/usr/bin/env bash
set -euo pipefail

SERVICE="sheet-db-api-dev"
REGION="asia-east1"
PROJECT=""

usage() {
  cat <<'USAGE'
Usage: scripts/cloud/get-run-url.sh [--service SERVICE] [--region REGION] [--project PROJECT]

Print Cloud Run service URL for dev service.
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

if [[ -z "$SERVICE" || -z "$REGION" ]]; then
  echo "SERVICE and REGION must be non-empty." >&2
  exit 2
fi

if [[ -z "$PROJECT" ]]; then
  PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
fi

if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "Missing gcloud project. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 2
fi

RUN_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')"

if [[ -z "$RUN_URL" ]]; then
  echo "Failed to resolve Cloud Run URL for service=$SERVICE region=$REGION project=$PROJECT" >&2
  exit 2
fi

echo "$RUN_URL"
