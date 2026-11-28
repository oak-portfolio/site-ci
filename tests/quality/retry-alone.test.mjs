// Run: node --test tests/quality/retry-alone.test.mjs (part of npm run test:quality).
// retry-alone reruns failed files together first, then alone; a file that only passes alone is an ordering bug unless allowlisted.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repo, "scripts/quality/retry-alone.mjs");

// flaky: fails the first time it runs (no marker yet), passes on every run after. broken: always fails. steady: always passes.
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "retry-alone-"));
  const header = 'import { test } from "node:test"; import assert from "node:assert/strict"; import { existsSync, writeFileSync } from "node:fs";\n';
  writeFileSync(path.join(dir, "flaky.test.mjs"), header +
    'test("timing", () => { const seen = existsSync(process.env.FLAKE_MARKER); writeFileSync(process.env.FLAKE_MARKER, "1"); assert.ok(seen, "first run under load"); });\n');
  writeFileSync(path.join(dir, "broken.test.mjs"), header + 'test("real", () => { assert.fail("always"); });\n');
  writeFileSync(path.join(dir, "steady.test.mjs"), header + 'test("ok", () => { assert.ok(true); });\n');
  // order-a holds a shared file for 1.5 s; order-b fails whenever it runs beside order-a and passes alone.
  writeFileSync(path.join(dir, "order-a.test.mjs"), header + 'import { rmSync } from "node:fs"; import { setTimeout as sleep } from "node:timers/promises";\n' +
    'test("holds shared state", async () => { writeFileSync(process.env.SHARED_FILE, "1"); await sleep(1500); rmSync(process.env.SHARED_FILE, { force: true }); });\n');
  writeFileSync(path.join(dir, "order-b.test.mjs"), header + 'import { setTimeout as sleep } from "node:timers/promises";\n' +
    'test("reads shared state", async () => { await sleep(300); assert.ok(!existsSync(process.env.SHARED_FILE), "order-a left shared state behind"); });\n');
  // Inside `node --test` this variable would make the nested runs silent children instead of real runs.
  const { NODE_TEST_CONTEXT, ...clean } = process.env;
  return { dir, env: { ...clean, FLAKE_MARKER: path.join(dir, "marker"), SHARED_FILE: path.join(dir, "shared") } };
}

const retry = (dir, env, files, extra = []) =>
  spawnSync(process.execPath, [script, ...extra, ...files], { cwd: dir, env, encoding: "utf8" });

test("plain node --test fails the flaky file (the behavior retry-alone replaces)", () => {
  const { dir, env } = fixture();
  const plain = spawnSync(process.execPath, ["--test", "flaky.test.mjs", "steady.test.mjs"], { cwd: dir, env, encoding: "utf8" });
  assert.notEqual(plain.status, 0);
});

test("a file that only passes alone is flagged order-dependent and fails the run", () => {
  const { dir, env } = fixture();
  const run = retry(dir, env, ["order-a.test.mjs", "order-b.test.mjs"], ["--test-concurrency=2"]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /flake-retry: order-b\.test\.mjs passed alone \(order-dependent\?\)/);
});

test("a file on the timing allowlist that passes alone keeps the run green", () => {
  const { dir, env } = fixture();
  const run = retry(dir, env, ["order-a.test.mjs", "order-b.test.mjs"], ["--test-concurrency=2", "--timing-allow=order-b"]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /order-b\.test\.mjs passed alone \(order-dependent\?\) but is on the timing allowlist/);
});

test("the built-in allowlist names today's known timing tests", async () => {
  const { timingAllowlist, isTimingTest } = await import("../../scripts/quality/retry-alone.mjs");
  for (const name of ["d114-review-fixes", "d20-assets", "d30-hover-hints", "d85-menu-glide", "d36-stall", "d69-ring-and-motion", "d73-card-parts", "d78-reasoning-flow", "d115-live-stream"]) {
    assert.ok(timingAllowlist.includes(name), name);
    assert.ok(isTimingTest(`/x/${name}.test.mjs`));
  }
  assert.equal(isTimingTest("/x/d99-other.test.mjs"), false);
});

test("a failure beside another failed file is rerun together first and accepted when it passes there", () => {
  const { dir, env } = fixture();
  const run = retry(dir, env, ["flaky.test.mjs", "broken.test.mjs", "steady.test.mjs"]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /rerunning all 3 files at concurrency \d+ to judge 2 failed files together/);
  assert.match(run.stdout, /flake-retry: flaky\.test\.mjs passed on rerun/);
});

test("an ordering bug beside an unrelated flake is still caught: the rerun includes the file that interfered", () => {
  const { dir, env } = fixture();
  const run = retry(dir, env, ["flaky.test.mjs", "order-a.test.mjs", "order-b.test.mjs"], ["--test-concurrency=3"]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /flake-retry: flaky\.test\.mjs passed on rerun/);
  assert.match(run.stdout, /flake-retry: order-b\.test\.mjs passed alone \(order-dependent\?\)/);
});

test("a file that fails alone too is a real failure", () => {
  const { dir, env } = fixture();
  const run = retry(dir, env, ["broken.test.mjs", "steady.test.mjs"]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /flake-retry: broken\.test\.mjs failed alone too/);
});

test("a deterministic file that fails is a real failure at once: never rerun, and left out of the together rerun", () => {
  const { dir, env } = fixture();
  const run = retry(dir, env, ["flaky.test.mjs", "broken.test.mjs", "steady.test.mjs"], ["--deterministic=broken", "--timing-allow=flaky"]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /flake-retry: broken\.test\.mjs failed and is deterministic, so it is not rerun/);
  assert.equal((run.stdout.match(/^ℹ tests /gm) ?? []).length, 2, "one full run and one alone rerun of flaky; broken is never rerun");
  assert.doesNotMatch(run.stdout, /rerunning .*broken/);
  assert.doesNotMatch(run.stdout, /rerunning all/);
  assert.match(run.stdout, /flake-retry: flaky\.test\.mjs passed alone \(order-dependent\?\) but is on the timing allowlist/);
});

test("the built-in deterministic list names the design judge, whose gallery pass takes about 17 minutes", async () => {
  const { isDeterministic } = await import("../../scripts/quality/retry-alone.mjs");
  assert.ok(isDeterministic("/x/tests/agent/premium/design-judge.test.mjs"));
  assert.equal(isDeterministic("/x/q07-cards.test.mjs"), false);
});

test("only failed files are rerun, and a file that fails alone is rerun once", () => {
  const { dir, env } = fixture();
  const run = retry(dir, env, ["flaky.test.mjs", "broken.test.mjs", "steady.test.mjs"]);
  assert.equal((run.stdout.match(/flake-retry: rerunning .* alone/g) ?? []).length, 1);
  assert.doesNotMatch(run.stdout, /flake-retry: steady/);
});

test("a clean run prints no retry lines and passes", () => {
  const { dir, env } = fixture();
  const run = retry(dir, env, ["steady.test.mjs"]);
  assert.equal(run.status, 0);
  assert.doesNotMatch(run.stdout, /flake-retry/);
});

test("no files is a usage error", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(run.status, 2);
});
