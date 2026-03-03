# Local Development Notes

## Recommended: `npm run smoke`

Run one command only:

```powershell
npm run smoke
```

`smoke` now supports "super lazy mode":
- Tries `GET /health` on base URL (default: `http://localhost:3000`)
- If base host is `localhost` and health fails, auto-fallback to `http://127.0.0.1:<port>`
- Auto-starts dev server (`npm run dev`) only when `/health` is unreachable (for example `ECONNREFUSED` / `fetch failed`)
- Waits for health (default timeout: 30000 ms), runs smoke flow, then auto-stops the spawned dev server
- If server is already up, it will not start a new one

If `/health` returns `404`:
- It usually means the port is occupied by another service, or you are targeting a different app/port
- `smoke` will stop and print guidance instead of blindly auto-starting
- Windows port check:

```powershell
netstat -ano | findstr :3000
tasklist /FI "PID eq <PID>"
```

Smoke flow:
- `GET /health`
- `POST /members/upsert`
- `GET /members/:uid`
- `POST /quiz/calc` (optional; `404` = skip)

## Manual mode (no auto-start)

```powershell
npm run smoke:manual
```

Equivalent:

```powershell
node scripts/smoke.js --no-auto-start
```

## Useful options

```powershell
node scripts/smoke.js --base http://localhost:3000 --uid U_DEBUG_LOCAL
node scripts/smoke.js --base http://127.0.0.1:3000
node scripts/smoke.js --apiKey "<your-api-key>"
node scripts/smoke.js --timeoutMs 30000
```

Notes:
- `--apiKey` overrides `.env` `API_KEY`
- Script never prints the API key

## Secrets Safety

- Do not commit `.env` or any secret values
- Do not commit service account JSON key files into this repo
