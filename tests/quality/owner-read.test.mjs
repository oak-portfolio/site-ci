// Run: node --test tests/quality/owner-read.test.mjs (part of npm run test:quality).
// Fake runs only. Nothing here switches workers.dev or reads the live owner.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSteps, candidateSummary, offOnSignal, parseArgs, parseControl, quotaFrom, readWindow, resetSwitchOff } from "../../scripts/quality/owner-read.mjs";
import { parseArgs as parseControlArgs, requestBody } from "../../scripts/quality/owner-control.mjs";

const hash = "ab".repeat(32);
const steps = ops => buildSteps({ ops, authority: hash, controlDir: "/x" });
const reply = (status, out = `/x/${status}.json`) => ({ status: 0, stdout: `noise\n${JSON.stringify({ op: "o", status, out })}\n` });
const noWait = { wait: async () => {} };
const window = (...args) => { resetSwitchOff(); return readWindow(...args); };

test("only read-only operations are accepted, and owner-status always runs first", () => {
  assert.deepEqual(parseArgs(["status-5cce2a0c"]).ops, ["owner-status", "status-5cce2a0c"]);
  assert.throws(() => parseArgs(["install"]), /Not a read-only owner operation/);
  assert.throws(() => parseArgs(["retire-5cce2a0c"]), /Not a read-only owner operation/);
  assert.throws(() => parseArgs(["--authority", "nope"]), /sha256/);
});

test("status and header reads take a full 64-hex candidate id (ADR 0005); anything else is refused", () => {
  const id = "5c".repeat(32);
  assert.deepEqual(parseArgs([`status=${id}`, `header=${id}`]).ops, ["owner-status", `status=${id}`, `header=${id}`]);
  for (const bad of ["status=5cce2a0c", `status=${id.toUpperCase()}`, `status=${id}0`, `pause=${id}`, `install=${id}`, `status-by-id=${id}`, "status="])
    assert.throws(() => parseArgs([bad]), /Not a read-only owner operation/, bad);
});

test("an id read runs owner-control with the id; a fixed alias still runs control.mjs", () => {
  const id = "5c".repeat(32), { reads } = steps([`status=${id}`, `header=${id}`, "header-5cce2a0c"]);
  assert.match(reads[0].args[0], /scripts\/quality\/owner-control\.mjs$/);
  assert.deepEqual(reads[0].args.slice(1), ["status-by-id", id, hash, "--dir", "/x"]);
  assert.deepEqual(reads[1].args.slice(1, 3), ["header-by-id", id]);
  assert.deepEqual(reads[2].args, ["/x/control.mjs", "header-5cce2a0c", hash]);
  assert.equal(reads[0].op, `status=${id}`);
});

test("owner-control sends only an id read with a validated id, never a write", () => {
  const id = "5c".repeat(32);
  assert.deepEqual(requestBody("status-by-id", id, hash), { authoritySha256: hash, operation: "status-by-id", candidateId: id });
  assert.deepEqual(parseControlArgs(["header-by-id", id, hash, "--dir", "/x"]), { body: { authoritySha256: hash, operation: "header-by-id", candidateId: id }, dir: "/x" });
  assert.throws(() => requestBody("pause", id, hash), /Not an id read/);
  assert.throws(() => requestBody("status", id, hash), /Not an id read/);
  assert.throws(() => requestBody("status-by-id", "5cce2a0c", hash), /candidateId/);
  assert.throws(() => requestBody("status-by-id", id, "nope"), /authoritySha256/);
  assert.throws(() => parseControlArgs(["status-by-id", id, hash]), /usage/);
});

test("a non-JSON control reply becomes an error, never a throw", () => {
  assert.deepEqual(parseControl(JSON.stringify({ status: 200, out: "/f" })), { status: 200, out: "/f" });
  assert.match(parseControl("", "SyntaxError: Unexpected token '<'").error, /unreadable control reply: SyntaxError/);
});

test("quota and candidate summaries read the fields a retirement check compares", () => {
  const body = { limits: { generations: { localBudgetLimit: 16, localBound: 4 }, nested: { bytes: { localBound: 179241942 } } } };
  assert.deepEqual(quotaFrom(body), { generations: 4, bytes: 179241942 });
  assert.deepEqual(candidateSummary({ state: "ready", stagingResource: {}, steps: [{ stepId: "a", completed: true }, { stepId: "b" }], cleanup: { phase: "vectors", deleted: 256, extra: 1 } }),
    { state: "ready", staging: true, openSteps: ["b"], cleanup: { phase: "vectors", deleted: 256 } });
  assert.equal(candidateSummary(undefined), null);
});

test("workers.dev is switched off after every read, and a failed read still switches it off", async () => {
  const seen = [];
  const run = async step => { seen.push(step.label); if (step.op === "status-5cce2a0c") return { status: 1, stdout: "", stderr: "SyntaxError: Unexpected token '<'" }; return step.op ? reply(200) : { status: 0, stdout: "" }; };
  const { summary, code } = await window(steps(["owner-status", "status-5cce2a0c"]), { ...noWait, body: () => ({ state: "retired" }) }, run);
  assert.deepEqual(seen, ["workers.dev on", "owner-status", "status-5cce2a0c", "workers.dev off"]);
  assert.equal(code, 1);
  assert.equal(summary.workersDevOff, true);
  assert.match(summary.reads["status-5cce2a0c"].error, /unreadable control reply: SyntaxError/);
});

test("owner-status is retried while workers.dev warms up, and a throw mid-window still switches off", async () => {
  let tries = 0;
  const run = async step => { if (step.op === "owner-status") return ++tries < 3 ? { status: 0, stdout: "<html>" } : reply(200); return { status: 0, stdout: "" }; };
  const ok = await window(steps(["owner-status"]), { ...noWait, body: () => ({}) }, run);
  assert.equal(tries, 3);
  assert.equal(ok.code, 0);

  const offs = [];
  const throwing = async step => { if (step.label === "workers.dev off") { offs.push(1); return { status: 0 }; } if (step.op) throw new Error("crash"); return { status: 0, stdout: "" }; };
  await assert.rejects(window(steps(["owner-status"]), noWait, throwing), /crash/);
  assert.equal(offs.length, 1);
});

test("a failed off switch exits 3", async () => {
  const run = async step => (step.label === "workers.dev off" ? { status: 1 } : step.op ? reply(200) : { status: 0, stdout: "" });
  const { code, summary } = await window(steps(["owner-status"]), { ...noWait, body: () => ({}) }, run);
  assert.equal(code, 3);
  assert.equal(summary.workersDevOff, false);
});

test("an off step that throws reads as not switched off, exit 3", async () => {
  const run = async step => { if (step.label === "workers.dev off") throw new Error("config missing workers_dev"); return step.op ? reply(200) : { status: 0, stdout: "" }; };
  const { code, summary } = await window(steps(["owner-status"]), { ...noWait, body: () => ({}) }, run);
  assert.equal(code, 3);
  assert.equal(summary.workersDevOff, false);
});

test("a signal mid-window switches workers.dev off once, then exits 130 (or 3 when off fails)", async () => {
  for (const [offStatus, expected] of [[0, 130], [1, 3]]) {
    resetSwitchOff();
    const handlers = {}, offs = [], exits = [];
    offOnSignal(steps(["owner-status"]).off, { run: async () => { offs.push(1); return { status: offStatus }; }, exit: code => exits.push(code), on: (signal, handler) => { handlers[signal] = handler; }, log: { error() {} } });
    assert.deepEqual(Object.keys(handlers), ["SIGINT", "SIGTERM", "SIGHUP"]);
    await handlers.SIGINT();
    assert.deepEqual([offs.length, exits], [1, [expected]]);
  }
  process.removeAllListeners("SIGINT"); process.removeAllListeners("SIGTERM"); process.removeAllListeners("SIGHUP");
});

test("the off step runs detached so a terminal Ctrl-C cannot kill it", () => {
  assert.equal(steps(["owner-status"]).off.detached, true);
});
