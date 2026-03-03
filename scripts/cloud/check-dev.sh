#!/usr/bin/env bash
set -euo pipefail

SERVICE="sheet-db-api-dev"
REGION="asia-east1"
PROJECT=""
AUTO_FIX="${AUTO_FIX:-0}"
TARGET_SHEET_LUCK20="20年大運表單"

usage() {
  cat <<'USAGE'
Usage: scripts/cloud/check-dev.sh [--service SERVICE] [--region REGION] [--project PROJECT]

Check Cloud Run(dev): project, service account, invoker policy, env keys, SHEET_LUCK20 residue.
Default is safe mode. Set AUTO_FIX=1 to auto-fix mismatched SHEET_LUCK20.
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

if [[ -z "$SERVICE" || -z "$REGION" ]]; then
  echo "SERVICE and REGION must be non-empty." >&2
  exit 2
fi

service_account="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --format='value(spec.template.spec.serviceAccountName)')"

allusers_invoker="$(gcloud run services get-iam-policy "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --flatten='bindings[].members' \
  --filter='bindings.role:roles/run.invoker AND bindings.members:allUsers' \
  --format='value(bindings.members)' || true)"

printf 'Project: %s\n' "$PROJECT"
printf 'Service: %s\n' "$SERVICE"
printf 'Region: %s\n' "$REGION"
printf 'Service Account: %s\n' "${service_account:-<not-set>}"

if [[ "$allusers_invoker" == *"allUsers"* ]]; then
  echo "Invoker(allUsers): ALLOWED"
else
  echo "Invoker(allUsers): NOT ALLOWED (reminder only, no auto-change)"
fi

echo "Env keys:"
env_keys_raw="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --format='value(spec.template.spec.containers[0].env[].name)' || true)"
if [[ -n "$env_keys_raw" ]]; then
  tr ';' '\n' <<< "$env_keys_raw" | sed '/^$/d' | sort -u | sed 's/^/- /'
else
  echo "- <none>"
fi

sheet_luck20_present="no"
if tr ';' '\n' <<< "$env_keys_raw" | grep -Fxq "SHEET_LUCK20"; then
  sheet_luck20_present="yes"
fi

sheet_luck20_value="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --format="value(spec.template.spec.containers[0].env[?name='SHEET_LUCK20'].value)" || true)"

sheet_luck20_status="absent"
if [[ "$sheet_luck20_present" == "yes" ]]; then
  if [[ "$sheet_luck20_value" == "$TARGET_SHEET_LUCK20" ]]; then
    sheet_luck20_status="expected"
  else
    sheet_luck20_status="mismatch"
  fi
fi

case "$sheet_luck20_status" in
  absent)
    echo "SHEET_LUCK20: absent"
    ;;
  expected)
    echo "SHEET_LUCK20: present and expected"
    ;;
  mismatch)
    echo "SHEET_LUCK20: present but mismatched"
    if [[ "$AUTO_FIX" == "1" ]]; then
      echo "AUTO_FIX=1 detected. Updating SHEET_LUCK20 to expected value."
      gcloud run services update "$SERVICE" \
        --region "$REGION" \
        --project "$PROJECT" \
        --update-env-vars "SHEET_LUCK20=$TARGET_SHEET_LUCK20" \
        --quiet >/dev/null
      echo "SHEET_LUCK20 fixed."
    else
      echo "Safe mode: no changes. Set AUTO_FIX=1 to auto-fix SHEET_LUCK20."
    fi
    ;;
  *)
    echo "SHEET_LUCK20: unknown status"
    ;;
esac
