#!/usr/bin/env node
require("dotenv").config();

const { spawn } = require("node:child_process");

const DEFAULT_BASE = "http://localhost:3000";
const DEFAULT_UID = "U_DEBUG_LOCAL";
const DEFAULT_BIRTHDAY = "1990-01-24";
const DEFAULT_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 500;
const NETWORK_ERROR_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET"]);

function parseArgs(argv) {
  const args = {
    base: DEFAULT_BASE,
    uid: DEFAULT_UID,
    apiKey: "",
    autoStart: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const value = argv[i + 1];

    if (token === "--base" && value) {
      args.base = value;
      i += 1;
      continue;
    }
    if (token === "--uid" && value) {
      args.uid = value;
      i += 1;
      continue;
    }
    if (token === "--apiKey" && value) {
      args.apiKey = value;
      i += 1;
      continue;
    }
    if (token === "--auto-start") {
      args.autoStart = true;
      continue;
    }
    if (token === "--no-auto-start") {
      args.autoStart = false;
      continue;
    }
    if (token === "--timeoutMs" && value) {
      const timeoutMs = Number(value);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`Invalid --timeoutMs: ${value}`);
      }
      args.timeoutMs = Math.floor(timeoutMs);
      i += 1;
      continue;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBaseUrl(base) {
  let url;
  try {
    url = new URL(base);
  } catch (_) {
    throw new Error(`Invalid --base URL: ${base}`);
  }

  if (!url.protocol || !url.host) {
    throw new Error(`Invalid --base URL: ${base}`);
  }

  return url;
}

function getPortOrDefault(url) {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

function buildIpv4BaseIfLocalhost(baseUrl) {
  if (baseUrl.hostname !== "localhost") return null;
  const fallback = new URL(baseUrl.toString());
  fallback.hostname = "127.0.0.1";
  return fallback;
}

function toBaseString(url) {
  return url.toString().replace(/\/$/, "");
}

async function callJson({ method, url, headers, body, requestTimeoutMs = 10_000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }

    return { ok: res.ok, status: res.status, data, text };
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeBody(data, text) {
  if (data) return JSON.stringify(data);
  return (text || "").slice(0, 300);
}

async function checkHealth({ base, headers }) {
  try {
    const health = await callJson({ method: "GET", url: `${base}/health`, headers, requestTimeoutMs: 5_000 });
    if (health.status === 200 && health.data && health.data.ok === true) {
      return { kind: "ok", status: health.status, data: health.data, text: health.text };
    }

    if (health.status === 404) {
      return {
        kind: "wrong-service",
        status: health.status,
        reason: `GET /health returned 404 on ${base}`,
      };
    }

    return {
      kind: "http-error",
      status: health.status,
      reason: `GET /health returned ${health.status}`,
      data: health.data,
      text: health.text,
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const code = error && error.cause && error.cause.code ? String(error.cause.code) : "";
    const isNetworkError = NETWORK_ERROR_CODES.has(code) || /fetch failed/i.test(message);

    if (isNetworkError) {
      return { kind: "unreachable", reason: code ? `${message} (${code})` : message, code };
    }

    return { kind: "request-error", reason: message, code };
  }
}

function buildWrongServiceHelp({ base }) {
  const url = new URL(base);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return [
    `GET /health returned 404 on ${base}.`,
    `Port ${port} might be occupied by another service, or you started a different app/port.`,
    `Windows check: netstat -ano | findstr :${port}`,
    "Then inspect PID: tasklist /FI \"PID eq <PID>\"",
    "Fix by stopping that process or changing API port/base URL.",
  ].join("\n");
}

async function waitForHealth({ base, headers, timeoutMs, child }) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    assertChildIsAlive(child);
    const health = await checkHealth({ base, headers });
    if (health.kind === "ok") return;
    if (health.kind === "wrong-service") {
      throw new Error(buildWrongServiceHelp({ base }));
    }
    await sleep(HEALTH_POLL_MS);
  }

  throw new Error(`Timed out waiting for /health within ${timeoutMs}ms (${base}/health)`);
}

function startDevServer({ port }) {
  const isWin = process.platform === "win32";
  const command = isWin ? "cmd.exe" : "npm";
  const args = isWin ? ["/d", "/s", "/c", "npm run dev"] : ["run", "dev"];
  let child;
  try {
    child = spawn(command, args, {
      env: { ...process.env, PORT: String(port) },
      stdio: "inherit",
      detached: !isWin,
      windowsHide: true,
      shell: false,
    });
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    throw new Error(`Failed to start dev server via "${command} ${args.join(" ")}": ${msg}`);
  }
  child.on("error", (error) => {
    const msg = error && error.message ? error.message : String(error);
    child.__spawnError = msg;
  });

  return child;
}

async function stopProcessTree(child) {
  if (!child || !child.pid) return;
  if (child.exitCode !== null || child.killed) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("error", () => resolve());
      killer.on("close", () => resolve());
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (_) {
    try {
      child.kill("SIGTERM");
    } catch (_) {
      // Ignore if process is already gone.
    }
  }
}

function assertChildIsAlive(child) {
  if (!child) return;
  if (child.__spawnError) {
    throw new Error(`Dev server process error: ${child.__spawnError}`);
  }
  if (typeof child.exitCode === "number") {
    throw new Error(`Dev server exited early (exitCode=${child.exitCode})`);
  }
}

async function main() {
  const { base, uid, apiKey: cliApiKey, autoStart, timeoutMs } = parseArgs(process.argv.slice(2));
  const apiKey = String(cliApiKey || process.env.API_KEY || "").trim();
  const headers = { "content-type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const baseUrl = parseBaseUrl(base);
  const fallbackIpv4Url = buildIpv4BaseIfLocalhost(baseUrl);
  const port = getPortOrDefault(baseUrl);

  let activeBaseUrl = baseUrl;
  let spawnedDevServer = null;
  const primaryBase = toBaseString(baseUrl);
  const fallbackBase = fallbackIpv4Url ? toBaseString(fallbackIpv4Url) : null;

  const displayName = "Sun \u6e2c\u8a66";
  const memberPayload = { uid, displayName, level: "free" };

  console.log(`[smoke] base=${primaryBase}`);
  console.log(`[smoke] uid=${uid}`);
  console.log("[0/4] resolve base + health check");

  try {
    const primaryHealth = await checkHealth({ base: primaryBase, headers });
    if (primaryHealth.kind === "ok") {
      console.log(`  health up on ${primaryBase}`);
    } else if (primaryHealth.kind === "wrong-service") {
      throw new Error(buildWrongServiceHelp({ base: primaryBase }));
    } else if (fallbackIpv4Url && primaryHealth.kind === "unreachable") {
      console.log(`  localhost health failed (${primaryHealth.reason}), trying ${fallbackBase}`);
      const fallbackHealth = await checkHealth({ base: fallbackBase, headers });
      if (fallbackHealth.kind === "ok") {
        activeBaseUrl = fallbackIpv4Url;
        console.log(`  health up on ${fallbackBase}`);
      } else if (fallbackHealth.kind === "wrong-service") {
        throw new Error(buildWrongServiceHelp({ base: fallbackBase }));
      } else if (fallbackHealth.kind === "unreachable" && autoStart) {
        console.log(`  starting dev server on port ${port} (health failed: ${fallbackHealth.reason})`);
        spawnedDevServer = startDevServer({ port });
        assertChildIsAlive(spawnedDevServer);
        activeBaseUrl = fallbackIpv4Url;
        await waitForHealth({ base: fallbackBase, headers, timeoutMs, child: spawnedDevServer });
        console.log(`  dev server is up on ${fallbackBase}`);
      } else {
        throw new Error(
          `GET /health failed for ${primaryBase} and ${fallbackBase} (${fallbackHealth.reason})`
        );
      }
    } else if (primaryHealth.kind === "unreachable" && autoStart) {
      console.log(`  health unreachable (${primaryHealth.reason}), starting dev server on port ${port}`);
      spawnedDevServer = startDevServer({ port });
      assertChildIsAlive(spawnedDevServer);
      await waitForHealth({ base: primaryBase, headers, timeoutMs, child: spawnedDevServer });
      console.log(`  dev server is up on ${primaryBase}`);
    } else {
      throw new Error(`GET /health failed for ${primaryBase} (${primaryHealth.reason})`);
    }

    const activeBase = toBaseString(activeBaseUrl);

    console.log("[1/4] GET /health");
    const health = await callJson({ method: "GET", url: `${activeBase}/health`, headers });
    if (!health.ok || !health.data || health.data.ok !== true) {
      throw new Error(`GET /health failed (${health.status}): ${summarizeBody(health.data, health.text)}`);
    }
    console.log("  OK");

    console.log("[2/4] POST /members/upsert");
    const upsert = await callJson({
      method: "POST",
      url: `${activeBase}/members/upsert`,
      headers,
      body: memberPayload,
    });
    if (!upsert.ok || !upsert.data || upsert.data.ok !== true) {
      throw new Error(
        `POST /members/upsert failed (${upsert.status}): ${summarizeBody(upsert.data, upsert.text)}`
      );
    }
    console.log("  OK");

    console.log("[3/4] GET /members/:uid");
    const member = await callJson({
      method: "GET",
      url: `${activeBase}/members/${encodeURIComponent(uid)}`,
      headers,
    });
    if (!member.ok || !member.data || member.data.ok !== true) {
      throw new Error(
        `GET /members/${uid} failed (${member.status}): ${summarizeBody(member.data, member.text)}`
      );
    }
    console.log("  OK");

    console.log("[4/4] POST /quiz/calc (optional)");
    const quiz = await callJson({
      method: "POST",
      url: `${activeBase}/quiz/calc`,
      headers,
      body: { uid, birthday: DEFAULT_BIRTHDAY },
    });
    if (quiz.status === 404) {
      console.log("  SKIP (route not found)");
    } else if (!quiz.ok || !quiz.data || quiz.data.ok !== true) {
      throw new Error(`POST /quiz/calc failed (${quiz.status}): ${summarizeBody(quiz.data, quiz.text)}`);
    } else {
      console.log("  OK");
    }

    console.log("[smoke] completed");
  } finally {
    if (spawnedDevServer) {
      console.log("[smoke] stopping auto-started dev server");
      await stopProcessTree(spawnedDevServer);
    }
  }
}

main().catch((err) => {
  console.error("[smoke] failed");
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
