# Deploy to Cloud Run + LINE Webhook Runbook

This runbook is for promoting the current feature branch to production flow:
1. Open PR and merge.
2. Deploy to Cloud Run with service identity (no local JSON key on Cloud Run).
3. Run smoke against Cloud Run URL.
4. Switch LINE webhook URL and validate end-to-end.

## 0) Prerequisites

- Repo is clean enough to deploy from merged branch.
- `npm test` and `npm run smoke` pass locally.
- GCP project has Cloud Run + Secret Manager APIs enabled.
- You have a user-managed service account (example: `sheet-db-api-runner@PROJECT_ID.iam.gserviceaccount.com`).
- The Google Sheet is shared with that service account email.

Important:
- Do not commit `.env`, `secrets/`, service account JSON, or LINE token values.
- On Cloud Run, **do not set** `GOOGLE_APPLICATION_CREDENTIALS`.
  Cloud Run should use attached runtime service account identity (ADC).
- Prefer `--update-env-vars` over `--set-env-vars`.
  `--set-env-vars` overwrites unspecified keys.

## 1) PR and Merge

### PowerShell

```powershell
git checkout feat/roster-member-sheet
git pull --ff-only
npm test
npm run smoke
gh pr create --base main --head feat/roster-member-sheet --title "feat: roster member sheet rollout" --body-file docs/PR_CHECKLIST.md
```

### Cloud Shell (bash)

```bash
git checkout feat/roster-member-sheet
git pull --ff-only
npm test
npm run smoke
gh pr create --base main --head feat/roster-member-sheet --title "feat: roster member sheet rollout" --body-file docs/PR_CHECKLIST.md
```

Merge PR on GitHub after checks pass.

## 2) Env Key Allowlist (keys only, no values)

Set only required keys on Cloud Run:

- `SPREADSHEET_ID`
- `SHEETS_MEMBERS_TAB`
- `MEMBER_ROSTER_SHEET`
- `DUAL_WRITE_MEMBERS`
- `API_KEY`
- `LINE_REPLY_MODE`
- `SHEET_MAIN_PAID`
- `SHEET_ICE_HEART`
- `SHEET_FLOW`
- `SHEET_WUXING`
- `SHEET_EMOTION`
- `SHEET_LUCK20`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`

Do not set:

- `GOOGLE_APPLICATION_CREDENTIALS` (Cloud Run must use service identity)

If secrets are managed centrally, use Secret Manager + Cloud Run `--set-secrets` / Console Secrets mounting instead of plain env value copy.

## 3) Deploy Path A (Console UI)

1. Cloud Run > Service > `Edit and deploy new revision`.
2. Runtime, build, connections, security:
   - Set Service account = your user-managed SA.
3. Variables & Secrets:
   - Fill env keys from allowlist above.
   - Prefer secrets from Secret Manager for sensitive keys.
4. Deploy.
5. Copy Service URL (example: `https://SERVICE-xxxxx-uc.a.run.app`).

## 4) Deploy Path B (gcloud CLI)

Use helper scripts in this repo.

### 4.1 Preview required env keys only

PowerShell:

```powershell
.\scripts\deploy-cloudrun.ps1 -Mode console -EnvFile .env
```

Cloud Shell (bash):

```bash
bash scripts/deploy-cloudrun.sh --mode console --env-file .env
```

### 4.2 Preview gcloud commands (safe dry run)

PowerShell:

```powershell
.\scripts\deploy-cloudrun.ps1 -Mode gcloud -Service <SERVICE> -Region <REGION> -Project <PROJECT_ID> -ServiceAccount <SA_EMAIL>
```

Cloud Shell (bash):

```bash
bash scripts/deploy-cloudrun.sh --mode gcloud --service <SERVICE> --region <REGION> --project <PROJECT_ID> --service-account <SA_EMAIL>
```

### 4.3 Execute deployment

PowerShell:

```powershell
.\scripts\deploy-cloudrun.ps1 -Mode gcloud -Service <SERVICE> -Region <REGION> -Project <PROJECT_ID> -ServiceAccount <SA_EMAIL> -Execute
```

Cloud Shell (bash):

```bash
bash scripts/deploy-cloudrun.sh --mode gcloud --service <SERVICE> --region <REGION> --project <PROJECT_ID> --service-account <SA_EMAIL> --execute
```

Script behavior:
- Reads `.env` (or `--env-file`) and only uses allowlist keys.
- Does not print env values.
- Uses `gcloud run services update --update-env-vars` (safer).
- Also sets service identity via `--service-account`.

## 5) Cloud Run Smoke Acceptance

Get URL:

```bash
gcloud run services describe <SERVICE> --project <PROJECT_ID> --region <REGION> --format='value(status.url)'
```

Set URL and run smoke without auto-start:

### PowerShell

```powershell
$env:RUN_URL = "<RUN_URL>"
npm run smoke:cloud
# or
.\scripts\smoke-cloud.ps1 -RunUrl "<RUN_URL>"
```

### Cloud Shell (bash)

```bash
export RUN_URL="<RUN_URL>"
npm run smoke:cloud
```

Expected:
- `GET /health` ok
- `POST /members/upsert` ok
- `GET /members/:uid` ok
- `POST /quiz/calc` ok (or skip if route unavailable)
- `GET /debug/sheets/validate` ok when `API_KEY` is configured (or skip on `404` for older revision compatibility)

Quick manual check:

```bash
curl -sS "<RUN_URL>/health"
```

Should return `{"ok":true,...}`.

Debug schema/manual checks:

```bash
curl -sS "<RUN_URL>/debug/sheets/validate" -H "x-api-key: <API_KEY>"
curl -sS -X POST "<RUN_URL>/debug/sheets/ensure-events" -H "x-api-key: <API_KEY>"
```

## 6) LINE Webhook Switch Checklist

LINE Developers Console:

1. Messaging API > Webhook URL:
   - Set to `<RUN_URL>/line/webhook`.
2. Enable webhook.
3. Verify Channel secret and Access token are correctly configured on Cloud Run env/secrets.
4. Keep `LINE_REPLY_MODE=on` only when you are ready to reply from production.
5. Trigger test message and inspect:
   - Cloud Run logs
   - LINE webhook events log
   - API behavior (`follow` / `message` / `postback`)

## 7) End-to-End Acceptance

1. `curl <RUN_URL>/health` returns `ok: true`.
2. `npm run smoke:cloud` passes all required steps.
3. With `API_KEY` configured, smoke auto-validates `GET /debug/sheets/validate`; if debug route is absent on old revision, step is `SKIP` on `404`.
4. Send LINE message (e.g. `menu`, birthday input `YYYY-MM-DD`) and confirm:
   - webhook receives event
   - member data updates in sheet
   - expected reply behavior matches `LINE_REPLY_MODE`

## 8) Rollback (minimum)

1. Cloud Run > Revisions > route traffic back to previous healthy revision.
2. If webhook impact exists, temporarily disable webhook or set previous stable URL.
3. Re-run `/health` + smoke on rollback revision.
