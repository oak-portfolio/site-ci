#!/usr/bin/env node
// One lock for work that must not overlap on the shared dev server: `npm run validate` and
// scripts/quality/oak-states-capture.mjs. RETRO: a screenshot capture ran during validate on the same dev server.
//
// Library: acquireLock(file, holder) / releaseLock(file). A lock file with a dead pid is stale and cleared.
// CLI:     node scripts/quality/validate-lock.mjs [--url DEV_URL | --lock-file F] [--holder NAME] [--caffeinate] -- <command> [args]
//          Holds the lock while the command runs. --caffeinate wraps it in `caffeinate -i` on macOS so the laptop
//          does not sleep mid-run (a no-op elsewhere).
//          --max-load-per-core N refuses to start (exit 4) while the 5-minute load average per CPU is above N. RETRO (R31):
//          three validates at load 30 to 60 on 18 cores failed only on timing tests, which read as real failures.
//          OAK_VALIDATE_IGNORE_LOAD=1 or CI skips the check; a held lock is reported first.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { availableParallelism, loadavg, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

export const defaultDevUrl = process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321";

/** The lock is keyed on the dev server's port in os.tmpdir(), so a worktree validate and a main-checkout capture that
 * share the server on that port see each other. OAK_VALIDATE_LOCK_FILE lets tests use a scratch lock. */
export const lockFileForUrl = (url = defaultDevUrl) => {
  if (process.env.OAK_VALIDATE_LOCK_FILE) return process.env.OAK_VALIDATE_LOCK_FILE;
  const parsed = new URL(url);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return path.join(tmpdir(), `oak-validate-${port}.lock`);
};

export const defaultLockFile = lockFileForUrl();

const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
};

const readLock = file => {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
};

/** Returns { ok: true } or { ok: false, message } naming the live holder. */
export function acquireLock(file = defaultLockFile, holder = "unknown") {
  const body = JSON.stringify({ pid: process.pid, holder, startedAt: new Date().toISOString() });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(file, body, { flag: "wx" });
      return { ok: true };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const held = readLock(file);
    if (held && alive(held.pid) && held.pid !== process.pid) {
      return { ok: false, message: `${path.basename(file)} is held by ${held.holder ?? "another run"} (pid ${held.pid}, since ${held.startedAt}); wait for it to finish` };
    }
    try { unlinkSync(file); } catch { /* another run cleared it first */ }
  }
  return { ok: false, message: `${path.basename(file)} could not be taken` };
}

/** Removes the lock only when this process owns it. */
export function releaseLock(file = defaultLockFile) {
  const held = readLock(file);
  if (held?.pid === process.pid) {
    try { unlinkSync(file); } catch { /* already gone */ }
  }
}

/** Takes the lock for the life of this process; exits 1 with one line if a live run holds it. */
export function lockOrExit(holder, file = defaultLockFile) {
  const result = acquireLock(file, holder);
  if (!result.ok) {
    console.error(`lock: ${result.message}`);
    process.exit(1);
  }
  process.on("exit", () => releaseLock(file));
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
}

export const withCaffeinate = (command, args, platform = process.platform) =>
  platform === "darwin" && spawnSync("which", ["caffeinate"], { stdio: "ignore" }).status === 0
    ? { command: "caffeinate", args: ["-i", command, ...args] }
    : { command, args };

/** null when the machine is quiet enough, else the one-line reason to wait. Reads the 5-minute average. */
export function loadRefusal(maxPerCore, averages = loadavg(), cores = availableParallelism(), env = process.env) {
  if (maxPerCore === undefined || env.OAK_VALIDATE_IGNORE_LOAD === "1" || env.CI) return null;
  const perCore = averages[1] / cores;
  if (perCore <= maxPerCore) return null;
  return `machine busy: 5-minute load ${averages[1].toFixed(1)} on ${cores} cores (${perCore.toFixed(2)} per core, max ${maxPerCore}); timing tests fail under this load. Retry when quieter, or set OAK_VALIDATE_IGNORE_LOAD=1`;
}

function parseCli(argv) {
  const split = argv.indexOf("--");
  if (split < 0 || split === argv.length - 1) throw new Error("usage: validate-lock.mjs [--url DEV_URL | --lock-file F] [--holder NAME] [--caffeinate] [--max-load-per-core N] -- <command> [args]");
  const options = { lockFile: defaultLockFile, holder: "validate", caffeinate: false, maxLoadPerCore: undefined, rest: argv.slice(split + 1) };
  for (let i = 0; i < split; i += 1) {
    if (argv[i] === "--caffeinate") options.caffeinate = true;
    else if (argv[i] === "--url") options.lockFile = lockFileForUrl(argv[++i]);
    else if (argv[i] === "--lock-file") options.lockFile = path.resolve(argv[++i]);
    else if (argv[i] === "--holder") options.holder = argv[++i];
    else if (argv[i] === "--max-load-per-core") {
      options.maxLoadPerCore = Number(argv[++i]);
      if (!(options.maxLoadPerCore > 0)) throw new Error("--max-load-per-core needs a positive number");
    }
    else throw new Error(`unknown option ${argv[i]}`);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) { // realpath: a symlinked path such as /tmp still runs the script
  let options;
  try { options = parseCli(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(2); }
  const taken = acquireLock(options.lockFile, options.holder);
  if (!taken.ok) { console.error(`lock: ${taken.message}`); process.exit(1); }
  process.on("exit", () => releaseLock(options.lockFile));
  const busy = loadRefusal(options.maxLoadPerCore);
  if (busy) { console.error(`validate: ${busy}`); process.exit(4); }
  const [command, ...args] = options.rest;
  const run = options.caffeinate ? withCaffeinate(command, args) : { command, args };
  const child = spawn(run.command, run.args, { stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on("error", error => { console.error(error.message); process.exit(127); });
}
