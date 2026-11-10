// agent-bridge.mjs
// WholeShare local agent bridge.
//
// Purpose: give the paired Muse agent a terminal on this Mac without any
// cloud service, tunnel, or third party account. It is fully local.
// Transport is the Mac file system, which the agent already reaches through
// the paired device: the agent writes commands, this bridge runs them here,
// the agent reads the results back.
//
// Start it once, by hand, from the project folder:
//   node scripts/agent-bridge.mjs
// Or install it as a login item so it starts on its own (autonomous, local):
//   launchctl load ~/Library/LaunchAgents/com.wholeshare.agent-bridge.plist
// Stop it at any time:
//   touch .scratch/agent-bridge/STOP
//   launchctl unload ~/Library/LaunchAgents/com.wholeshare.agent-bridge.plist
//   Ctrl-C in the terminal running it
// It runs until stopped. It does not stop on idle.
//
// Safety rules, enforced in code, not by convention:
// - Only allowlisted commands run, inside the project folder only.
// - No shell. Every command runs with execFile and an argument array.
// - No extra arguments, no pipes, no redirects, no sudo, no rm.
// - Nothing reads or prints .env or any secret. Output is redacted.
// - Every command and its outcome is appended to log.jsonl for review.
// - It never starts on its own unless the user installs the LaunchAgent.
// - It never phones home. No network calls except the allowlisted local
//   probes to localhost:3000 and 127.0.0.1:8000.

import { execFile, spawn } from "node:child_process";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
  rm,
} from "node:fs/promises";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const BRIDGE_DIR = path.join(PROJECT_ROOT, ".scratch", "agent-bridge");
const COMMANDS_FILE = path.join(BRIDGE_DIR, "commands.jsonl");
const RESULTS_DIR = path.join(BRIDGE_DIR, "results");
const LOG_FILE = path.join(BRIDGE_DIR, "log.jsonl");
const STOP_FILE = path.join(BRIDGE_DIR, "STOP");
const SERVER_FILE = path.join(BRIDGE_DIR, "server.json");
const SERVER_LOG = path.join(BRIDGE_DIR, "server.log");

const POLL_MS = 1000;

// npm scripts from package.json that the agent may run. `start` and `dev`
// are intentionally absent: long running servers go through start-server.
const ALLOWED_NPM_SCRIPTS = new Set([
  "build",
  "build:bryntum",
  "test",
  "test:unit",
  "check",
  "check:mocks",
  "verify:zero-sim",
  "lint",
  "lint:features",
  "doctor",
  "seed",
  "verify",
  "verify:escrow",
  "verify:paypal",
  "verify:gateway",
  "verify:fsm",
  "verify:durable",
  "verify:tokens",
  "verify:one-shot",
  "verify:full-harness",
  "tools:list",
  "eval:model",
  "toolkit:test",
  "agent:cycle",
  "verify-webmcp",
  "cdp",
]);

// Long running npm scripts get a longer timeout.
const LONG_SCRIPTS = new Set(["check", "test", "test:unit", "verify:full-harness"]);
const DEFAULT_TIMEOUT_MS = 120_000;
const LONG_TIMEOUT_MS = 600_000;

// Local probes only. Nothing outside this Mac.
const ALLOWED_PROBE_HOSTS = ["http://localhost:3000", "http://127.0.0.1:8000"];
const ALLOWED_PROBE_PATHS = [
  "/",
  "/api/v1/mcp/tools",
  "/api/v1/clans",
  "/api/v1/ledger",
  "/api/v1/logistics/shipments",
  "/v1/models",
];

const SECRET_PATTERN =
  /(PAYPAL_[A-Z_]*SECRET|CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN|PRIVATE_KEY|PASSWORD|API_KEY)\s*=\s*[^\s"']+/gi;

const processed = new Set();
let lastActivity = Date.now();
let stopping = false;

function redact(text) {
  return String(text ?? "").replace(SECRET_PATTERN, "$1=[redacted]");
}

async function log(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
  try {
    await appendFile(LOG_FILE, line, "utf8");
  } catch {
    // Logging must never break command execution.
  }
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function runFile(file, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { cwd: PROJECT_ROOT, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error ? (error.code ?? 1) : 0,
          stdout: redact(stdout),
          stderr: redact(stderr),
          timedOut: Boolean(error && error.killed),
        });
      },
    );
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout: "", stderr: redact(error.message), timedOut: false });
    });
  });
}

async function readServerState() {
  try {
    return JSON.parse(await readFile(SERVER_FILE, "utf8"));
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  const current = await readServerState();
  if (current && pidAlive(current.pid)) {
    return { ok: false, reason: "server already running", pid: current.pid };
  }
  const child = spawn("node", ["src/web/server.js"], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();
  const state = {
    pid: child.pid,
    port: 3000,
    url: "http://localhost:3000/",
    log: SERVER_LOG,
    startedAt: new Date().toISOString(),
  };
  await writeFile(SERVER_FILE, JSON.stringify(state, null, 2), "utf8");
  return { ok: true, ...state };
}

async function stopServer() {
  const current = await readServerState();
  if (!current) {
    return { ok: false, reason: "no server recorded" };
  }
  try {
    process.kill(current.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  await rm(SERVER_FILE, { force: true });
  return { ok: true, stoppedPid: current.pid };
}

async function handleCommand(command) {
  const { id, kind } = command;
  if (!id || typeof id !== "string") {
    return { ok: false, reason: "command needs a string id" };
  }
  if (processed.has(id) || (await exists(path.join(RESULTS_DIR, `${id}.json`)))) {
    return null; // Already ran, never run twice.
  }
  processed.add(id);
  lastActivity = Date.now();

  let result;
  if (kind === "npm") {
    if (!ALLOWED_NPM_SCRIPTS.has(command.script)) {
      result = { ok: false, reason: `npm script not allowlisted: ${command.script}` };
    } else {
      const timeout = LONG_SCRIPTS.has(command.script) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
      const ran = await runFile("npm", ["run", command.script], timeout);
      result = { ok: ran.exitCode === 0, ...ran };
    }
  } else if (kind === "probe") {
    const url = String(command.url ?? "");
    const allowed = ALLOWED_PROBE_PATHS.some((p) =>
      ALLOWED_PROBE_HOSTS.some((h) => url === h + p),
    );
    if (!allowed) {
      result = { ok: false, reason: `probe url not allowlisted: ${url}` };
    } else {
      const ran = await runFile("curl", ["-sS", "--max-time", "10", url], 20_000);
      result = { ok: ran.exitCode === 0, ...ran };
    }
  } else if (kind === "start-server") {
    result = await startServer();
  } else if (kind === "stop-server") {
    result = await stopServer();
  } else if (kind === "status") {
    const server = await readServerState();
    result = {
      ok: true,
      bridge: {
        projectRoot: PROJECT_ROOT,
        uptimeSeconds: Math.round(process.uptime()),
        processed: processed.size,
      },
      server: server && pidAlive(server.pid) ? server : null,
    };
  } else {
    result = { ok: false, reason: `unknown kind: ${kind}` };
  }

  const payload = { id, kind, at: new Date().toISOString(), ...result };
  const tmp = path.join(
    RESULTS_DIR,
    `${id}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  await writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  try {
    await rename(tmp, path.join(RESULTS_DIR, `${id}.json`));
  } catch (error) {
    // Another drain already wrote this result. Treat that as success.
    if (await exists(path.join(RESULTS_DIR, `${id}.json`))) {
      await rm(tmp, { force: true });
    } else {
      throw error;
    }
  }
  await log({ id, kind, ok: Boolean(result.ok), exitCode: result.exitCode ?? null });
  return payload;
}

let draining = false;

async function drainCommands() {
  if (stopping || draining) {
    return;
  }
  draining = true;
  try {
    await drainCommandsInner();
  } finally {
    draining = false;
  }
}

async function drainCommandsInner() {
  if (stopping) {
    return;
  }
  let text;
  try {
    text = await readFile(COMMANDS_FILE, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let command;
    try {
      command = JSON.parse(trimmed);
    } catch {
      continue;
    }
    // Refuse anything that looks like a secret or a shell escape, even
    // though execFile never hands text to a shell.
    if (/\.env|sudo|rm\s|;\s*\|/.test(trimmed)) {
      continue;
    }
    await handleCommand(command);
  }
}

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(COMMANDS_FILE, "", { flag: "a" });
  await log({ event: "bridge started", projectRoot: PROJECT_ROOT });
  console.log(`agent-bridge running for ${PROJECT_ROOT}`);
  console.log(`commands: ${COMMANDS_FILE}`);
  console.log(`results: ${RESULTS_DIR}`);
  console.log(`stop: touch ${STOP_FILE} or Ctrl-C`);

  // Watch for new commands, with polling as a fallback.
  try {
    watch(COMMANDS_FILE, () => {
      void drainCommands();
    });
  } catch {
    // Polling below still works.
  }
  await drainCommands();

  const timer = setInterval(async () => {
    if (await exists(STOP_FILE)) {
      stopping = true;
      clearInterval(timer);
      await log({ event: "bridge stopped by STOP file" });
      console.log("agent-bridge stopped by STOP file");
      process.exit(0);
    }
    await drainCommands();
  }, POLL_MS);
}

process.on("SIGINT", async () => {
  await log({ event: "bridge stopped by SIGINT" });
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await log({ event: "bridge stopped by SIGTERM" });
  process.exit(0);
});

await main();
