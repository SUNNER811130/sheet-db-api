#!/usr/bin/env bash
set -euo pipefail

SERVICE="sheet-db-api-dev"
REGION="asia-east1"
PROJECT=""

usage() {
  cat <<'USAGE'
Usage: scripts/cloud/set-env-dev.sh [--service SERVICE] [--region REGION] [--project PROJECT]

Update Cloud Run(dev) env vars from shell env only (no hardcoded secrets).
Required env:
  API_KEY
  SPREADSHEET_ID
  LINE_CHANNEL_SECRET
  LINE_CHANNEL_ACCESS_TOKEN
Optional env:
  MEMBER_ROSTER_SHEET (default: 會員清單)
  LINE_REPLY_MODE (default: off)
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

if [[ -z "$PROJECT" ]]; then
  PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
fi

if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "Missing gcloud project. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 2
fi

missing=()
[[ -n "${API_KEY:-}" ]] || missing+=("API_KEY")
[[ -n "${SPREADSHEET_ID:-}" ]] || missing+=("SPREADSHEET_ID")
[[ -n "${LINE_CHANNEL_SECRET:-}" ]] || missing+=("LINE_CHANNEL_SECRET")
[[ -n "${LINE_CHANNEL_ACCESS_TOKEN:-}" ]] || missing+=("LINE_CHANNEL_ACCESS_TOKEN")

if (( ${#missing[@]} > 0 )); then
  echo "Missing required env vars: ${missing[*]}" >&2
  exit 2
fi

MEMBER_ROSTER_SHEET="${MEMBER_ROSTER_SHEET:-會員清單}"
LINE_REPLY_MODE="${LINE_REPLY_MODE:-off}"

gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --update-env-vars "API_KEY=$API_KEY" \
  --update-env-vars "SPREADSHEET_ID=$SPREADSHEET_ID" \
  --update-env-vars "MEMBER_ROSTER_SHEET=$MEMBER_ROSTER_SHEET" \
  --update-env-vars "LINE_CHANNEL_SECRET=$LINE_CHANNEL_SECRET" \
  --update-env-vars "LINE_CHANNEL_ACCESS_TOKEN=$LINE_CHANNEL_ACCESS_TOKEN" \
  --update-env-vars "LINE_REPLY_MODE=$LINE_REPLY_MODE" \
  --quiet >/dev/null

echo "Updated env vars on $SERVICE ($REGION, project=$PROJECT):"
echo "- API_KEY"
echo "- SPREADSHEET_ID"
echo "- MEMBER_ROSTER_SHEET"
echo "- LINE_CHANNEL_SECRET"
echo "- LINE_CHANNEL_ACCESS_TOKEN"
echo "- LINE_REPLY_MODE"
