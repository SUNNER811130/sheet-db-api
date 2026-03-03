# Dev Runbook (GitHub + Cloud Run + LINE)

This runbook is for dev service only.

## 1) GitHub auth and push

```bash
gh --version
gh auth status
```

If not logged in:

```bash
gh auth login -w
gh auth setup-git
```

Push current branch:

```bash
git push -u origin "$(git branch --show-current)"
```

## 2) Why `.gcloudignore` exists

Use `.gcloudignore` to control source upload for `gcloud run deploy --source .`.
It must include `#!include:.gitignore` and explicitly unignore Node manifests such as `package.json` and `package-lock.json`, so buildpacks can detect Node.js correctly.

## 3) Cloud Run(dev) env setup

Target defaults:
- `SERVICE=sheet-db-api-dev`
- `REGION=asia-east1`
- `PROJECT=$(gcloud config get-value project)`

Export envs in Cloud Shell first (never commit secrets):

```bash
export API_KEY='...'
export SPREADSHEET_ID='...'
export LINE_CHANNEL_SECRET='...'
export LINE_CHANNEL_ACCESS_TOKEN='...'
export MEMBER_ROSTER_SHEET='會員清單'    # optional
export LINE_REPLY_MODE='off'             # recommended before webhook reply
```

Apply envs:

```bash
bash scripts/cloud/set-env-dev.sh
```

After verification, switch reply mode to on:

```bash
export LINE_REPLY_MODE='on'
bash scripts/cloud/set-env-dev.sh
```

## 4) Cloud acceptance flow

Get service URL:

```bash
bash scripts/cloud/get-run-url.sh
```

Health:

```bash
RUN_URL="$(bash scripts/cloud/get-run-url.sh)"
curl -sS "$RUN_URL/health"
```

Debug validate (with API key):

```bash
curl -sS "$RUN_URL/debug/sheets/validate" -H "x-api-key: $API_KEY"
```

Ensure events:

```bash
curl -sS -X POST "$RUN_URL/debug/sheets/ensure-events" -H "x-api-key: $API_KEY"
```

Smoke:

```bash
bash scripts/cloud/smoke-cloud.sh
```

## 5) LINE webhook rollout order

1. Keep `LINE_REPLY_MODE=off`.
2. Point webhook URL to `$RUN_URL/line/webhook`.
3. Confirm signature/log behavior first.
4. When events and logs are healthy, set `LINE_REPLY_MODE=on`.

## 6) Risk reminders

- Repo revision and Cloud Run revision can drift; always verify both before testing.
- Residual `SHEET_LUCK20` can cause wrong sheet routing; run `bash scripts/cloud/check-dev.sh` to detect it.
- Never print or commit API keys, LINE token/secret, or credential files.
