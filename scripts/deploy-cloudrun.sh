#!/usr/bin/env bash
set -euo pipefail

MODE="console"
SERVICE="${SERVICE:-}"
REGION="${REGION:-}"
PROJECT="${PROJECT:-}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-}"
ENV_FILE=".env"
EXECUTE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --service)
      SERVICE="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --service-account)
      SERVICE_ACCOUNT="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --execute)
      EXECUTE="true"
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "console" && "$MODE" != "gcloud" ]]; then
  echo "Invalid --mode: $MODE (allowed: console|gcloud)" >&2
  exit 1
fi

ALLOWLIST=(
  SPREADSHEET_ID
  SHEETS_MEMBERS_TAB
  MEMBER_ROSTER_SHEET
  DUAL_WRITE_MEMBERS
  API_KEY
  LINE_REPLY_MODE
  SHEET_MAIN_PAID
  SHEET_ICE_HEART
  SHEET_FLOW
  SHEET_WUXING
  SHEET_EMOTION
  SHEET_LUCK20
  LINE_CHANNEL_SECRET
  LINE_CHANNEL_ACCESS_TOKEN
)

declare -A ENV_VALUES=()
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "${line// }" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
        value="${value:1:${#value}-2}"
      fi
      ENV_VALUES["$key"]="$value"
    fi
  done < "$ENV_FILE"
fi

require_or_todo() {
  local name="$1"
  local value="$2"
  if [[ -z "${value// }" ]]; then
    echo "TODO_${name}"
  else
    echo "$value"
  fi
}

SERVICE="$(require_or_todo SERVICE "$SERVICE")"
REGION="$(require_or_todo REGION "$REGION")"
PROJECT="$(require_or_todo PROJECT "$PROJECT")"
SERVICE_ACCOUNT="$(require_or_todo SERVICE_ACCOUNT "$SERVICE_ACCOUNT")"

KEYS_PRESENT=()
for key in "${ALLOWLIST[@]}"; do
  v="${ENV_VALUES[$key]-}"
  if [[ -n "${v// }" ]]; then
    KEYS_PRESENT+=("$key")
  fi
done

echo "[deploy-cloudrun] mode=$MODE"
echo "[deploy-cloudrun] service=$SERVICE region=$REGION project=$PROJECT"
echo "[deploy-cloudrun] service-account=$SERVICE_ACCOUNT"
echo "[deploy-cloudrun] env file=$ENV_FILE"
echo
echo "Allowlist env keys for this project:"
for key in "${ALLOWLIST[@]}"; do
  echo "  - $key"
done
echo

if [[ "$MODE" == "console" ]]; then
  echo "Console mode: fill these keys in Cloud Run > Edit and deploy new revision > Variables & Secrets:"
  if [[ ${#KEYS_PRESENT[@]} -eq 0 ]]; then
    echo "  (none found from $ENV_FILE, fill manually by key name above)"
  else
    for key in "${KEYS_PRESENT[@]}"; do
      echo "  - $key"
    done
  fi
  echo
  echo "Important:"
  echo "  - Do NOT set GOOGLE_APPLICATION_CREDENTIALS on Cloud Run."
  echo "  - Attach a user-managed service account to Cloud Run service identity."
  exit 0
fi

for required in "$SERVICE" "$REGION" "$PROJECT" "$SERVICE_ACCOUNT"; do
  if [[ "$required" == TODO_* ]]; then
    echo "Missing required inputs: SERVICE REGION PROJECT SERVICE_ACCOUNT" >&2
    echo "Provide --service --region --project --service-account (or export env vars)." >&2
    exit 1
  fi
done

UPDATE_PAIRS=()
for key in "${KEYS_PRESENT[@]}"; do
  value="${ENV_VALUES[$key]}"
  value="${value//\\/\\\\}"
  value="${value//,/\\,}"
  UPDATE_PAIRS+=("${key}=${value}")
done
UPDATE_ENV_ARG=""
if [[ ${#UPDATE_PAIRS[@]} -gt 0 ]]; then
  IFS=,
  UPDATE_ENV_ARG="${UPDATE_PAIRS[*]}"
  unset IFS
fi

DEPLOY_CMD=(gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" --source . --service-account "$SERVICE_ACCOUNT" --allow-unauthenticated)
UPDATE_CMD=(gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" --service-account "$SERVICE_ACCOUNT")
if [[ -n "$UPDATE_ENV_ARG" ]]; then
  UPDATE_CMD+=(--update-env-vars "$UPDATE_ENV_ARG")
fi
URL_CMD=(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')

echo "gcloud mode (safe preview):"
echo "  ${DEPLOY_CMD[*]}"
if [[ -n "$UPDATE_ENV_ARG" ]]; then
  echo "  gcloud run services update $SERVICE --project $PROJECT --region $REGION --service-account $SERVICE_ACCOUNT --update-env-vars <redacted>"
else
  echo "  gcloud run services update $SERVICE --project $PROJECT --region $REGION --service-account $SERVICE_ACCOUNT"
fi
echo "  ${URL_CMD[*]}"
echo
echo "Notes:"
echo "  - This uses --update-env-vars (safer than --set-env-vars)."
echo "  - Values are never printed."
echo "  - --set-env-vars can overwrite keys not listed; avoid it unless intentional."

if [[ "$EXECUTE" != "true" ]]; then
  echo
  echo "Dry run only. Add --execute to run gcloud commands."
  exit 0
fi

"${DEPLOY_CMD[@]}"
"${UPDATE_CMD[@]}"
"${URL_CMD[@]}"
