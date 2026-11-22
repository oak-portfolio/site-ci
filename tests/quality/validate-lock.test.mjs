// Run: node --test tests/quality/validate-lock.test.mjs (part of npm run test:quality).
// validate and oak-states-capture share one lock per dev server port, in os.tmpdir(): either refuses while the other is alive; a dead pid is stale.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { acquireLock, loadRefusal, lockFileForUrl, releaseLock, withCaffeinate } from "../../scripts/quality/validate-lock.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lockCli = path.join(repo, "scripts/quality/validate-lock.mjs");
const capture = path.join(repo, "scripts/quality/oak-states-capture.mjs");
const scratch = () => path.join(mkdtempSync(path.join(tmpdir(), "validate-lock-")), ".validate.lock");
const sleeper = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
const lockBy = (file, pid, holder) => writeFileSync(file, JSON.stringify({ pid, holder, startedAt: "2026-10-26T00:00:00Z" }));

test("a free lock is taken and released by its owner", () => {
  const file = scratch();
  assert.deepEqual(acquireLock(file, "validate"), { ok: true });
  assert.equal(JSON.parse(readFileSync(file, "utf8")).pid, process.pid);
  releaseLock(file);
  assert.equal(existsSync(file), false);
});

test("a live holder blocks a second run and is named in the message", () => {
  const file = scratch(), holder = sleeper();
  try {
    lockBy(file, holder.pid, "oak-states-capture");
    const result = acquireLock(file, "validate");
    assert.equal(result.ok, false);
    assert.match(result.message, /held by oak-states-capture \(pid \d+/);
    releaseLock(file);
    assert.equal(existsSync(file), true, "a process never releases a lock it does not own");
  } finally { holder.kill(); }
});

test("a lock whose pid is dead is stale and cleared", async () => {
  const file = scratch(), gone = sleeper();
  gone.kill();
  await new Promise(resolve => gone.on("exit", resolve));
  lockBy(file, gone.pid, "validate");
  assert.deepEqual(acquireLock(file, "oak-states-capture"), { ok: true });
  assert.equal(JSON.parse(readFileSync(file, "utf8")).holder, "oak-states-capture");
});

test("the CLI holds the lock while its command runs and refuses a second run", async () => {
  const file = scratch();
  const first = spawn(process.execPath, [lockCli, "--lock-file", file, "--", process.execPath, "-e", "setTimeout(() => {}, 3000)"], { stdio: "ignore" });
  for (let i = 0; i < 50 && !existsSync(file); i += 1) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(JSON.parse(readFileSync(file, "utf8")).holder, "validate");
  const second = spawnSync(process.execPath, [lockCli, "--lock-file", file, "--", process.execPath, "-e", "0"], { encoding: "utf8" });
  assert.equal(second.status, 1);
  assert.match(second.stderr, /lock: .validate.lock is held by validate/);
  first.kill("SIGTERM");
  await new Promise(resolve => first.on("exit", resolve));
  assert.equal(existsSync(file), false, "the lock is released when the run ends");
});

test("the CLI passes the command's exit code through", () => {
  const file = scratch();
  const run = spawnSync(process.execPath, [lockCli, "--lock-file", file, "--", process.execPath, "-e", "process.exit(7)"]);
  assert.equal(run.status, 7);
  assert.equal(existsSync(file), false);
});

test("oak-states-capture refuses to start while validate holds the lock", () => {
  const file = scratch(), holder = sleeper();
  try {
    lockBy(file, holder.pid, "validate");
    const run = spawnSync(process.execPath, [capture, "--base-url", "http://127.0.0.1:1", "--label", "lock-test", "--states", "a"],
      { encoding: "utf8", env: { ...process.env, OAK_VALIDATE_LOCK_FILE: file } });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /lock: .validate.lock is held by validate/);
  } finally { holder.kill(); }
});

test("caffeinate wraps the command on macOS only", () => {
  assert.deepEqual(withCaffeinate("npm", ["run", "x"], "linux"), { command: "npm", args: ["run", "x"] });
  if (process.platform === "darwin") assert.deepEqual(withCaffeinate("npm", ["run", "x"], "darwin"), { command: "caffeinate", args: ["-i", "npm", "run", "x"] });
});

test("the lock file is keyed on the dev server port in os.tmpdir()", () => {
  const { OAK_VALIDATE_LOCK_FILE, ...env } = process.env;
  const keyed = url => spawnSync(process.execPath, ["-e", `import(${JSON.stringify(path.join(repo, "scripts/quality/validate-lock.mjs"))}).then(m => console.log(m.lockFileForUrl(${JSON.stringify(url)})))`], { env, encoding: "utf8" }).stdout.trim();
  assert.equal(keyed("http://127.0.0.1:4321"), path.join(tmpdir(), "oak-validate-4321.lock"));
  assert.equal(keyed("http://localhost:4333/"), path.join(tmpdir(), "oak-validate-4333.lock"));
  assert.equal(typeof lockFileForUrl, "function");
});

test("a validate in one checkout blocks a capture started from another on the same port, not on another port", async () => {
  const { OAK_VALIDATE_LOCK_FILE, ...env } = process.env;
  const port = 40000 + Math.floor(Math.random() * 20000);
  const elsewhere = mkdtempSync(path.join(tmpdir(), "other-checkout-"));
  const holder = spawn(process.execPath, [lockCli, "--url", `http://127.0.0.1:${port}`, "--", process.execPath, "-e", "setTimeout(() => {}, 4000)"], { cwd: elsewhere, env, stdio: "ignore" });
  const file = lockFileForUrl(`http://127.0.0.1:${port}`);
  try {
    for (let i = 0; i < 50 && !existsSync(file); i += 1) await new Promise(resolve => setTimeout(resolve, 100));
    const blocked = spawnSync(process.execPath, [capture, "--base-url", `http://127.0.0.1:${port}`, "--label", "lock-test", "--states", "a"], { encoding: "utf8", env });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, new RegExp(`lock: oak-validate-${port}.lock is held by validate`));
    const other = spawnSync(process.execPath, [capture, "--base-url", `http://127.0.0.1:${port + 1}`, "--label", "lock-test", "--states", "a"], { encoding: "utf8", env });
    assert.doesNotMatch(other.stderr, /lock: /, "another port has its own lock");
  } finally {
    holder.kill("SIGTERM");
    await new Promise(resolve => holder.on("exit", resolve));
  }
});

test("validate refuses to start on a busy machine, with exit 4 and one line naming the load", () => {
  assert.equal(loadRefusal(undefined, [99, 99, 99], 18, {}), null);
  assert.equal(loadRefusal(1, [10, 17.9, 40], 18, {}), null);
  assert.match(loadRefusal(1, [10, 54, 40], 18, {}), /machine busy: 5-minute load 54\.0 on 18 cores \(3\.00 per core, max 1\)/);
  assert.equal(loadRefusal(1, [10, 54, 40], 18, { OAK_VALIDATE_IGNORE_LOAD: "1" }), null);
  assert.equal(loadRefusal(1, [10, 54, 40], 18, { CI: "true" }), null);
  if (loadavg()[1] > 0) { // Windows and an idle box can read 0, which no threshold can call busy
    const { CI: _ci, ...env } = process.env;
    const busy = spawnSync(process.execPath, [lockCli, "--lock-file", scratch(), "--max-load-per-core", "0.000001", "--", process.execPath, "-e", "0"], { encoding: "utf8", env: { ...env, OAK_VALIDATE_IGNORE_LOAD: "" } });
    assert.equal(busy.status, 4);
    assert.match(busy.stderr, /^validate: machine busy/);
  }
  assert.equal(spawnSync(process.execPath, [lockCli, "--max-load-per-core", "0", "--", "true"], { encoding: "utf8" }).status, 2);
});
