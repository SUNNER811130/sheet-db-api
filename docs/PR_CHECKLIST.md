## PR Description Template

### Change Summary
- What changed in this PR (feature/fix/refactor).

### Test Evidence
- `npm test` result:
- `npm run smoke` result:
- Optional screenshots/log snippets:

### Risks
- Possible regressions:
- Operational impact (Cloud Run / LINE webhook / Sheets):

### Rollback Plan
- Cloud Run revision rollback steps:
- Data compatibility concerns:

## Merge Gate Checklist

- [ ] Branch is up to date with `main`
- [ ] `npm test` passes
- [ ] `npm run smoke` passes
- [ ] No secrets committed (`.env`, tokens, JSON keys)
- [ ] Deployment/runbook steps reviewed (`docs/DEPLOY_CLOUD_RUN.md`)
