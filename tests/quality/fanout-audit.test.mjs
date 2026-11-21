import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/quality/fanout-audit.mjs", import.meta.url));
const ABS = "claude-subscription-abs/claude-opus-5-5";
const OAK_API = "claude-api-oak/claude-opus-5-5";
const meta = (id) => ({ timestamp: "2026-10-21T09:59:59.000Z", type: "session_meta", payload: { id } });
const turn = (at, turn_id, model) => ({ timestamp: at, type: "turn_context", payload: { turn_id, model } });
const call = (at, name, args) => ({
  timestamp: at,
  type: "response_item",
  payload: { type: "function_call", name, namespace: "collaboration", arguments: JSON.stringify(args) },
});
const spawn = (at, args) => call(at, "spawn_agent", args);
// An interrupt and its result, which names the agent's status at that moment.
const interrupt = (at, id, target) => ({ ...call(at, "interrupt_agent", { target }), payload: { ...call(at, "interrupt_agent", { target }).payload, call_id: id } });
const interruptResult = (at, id, previous) => ({
  timestamp: at,
  type: "response_item",
  payload: { type: "function_call_output", call_id: id, output: JSON.stringify({ previous_status: previous }) },
});
const jsonl = (entries) => `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;

const home = mkdtempSync(join(tmpdir(), "fanout-audit-"));
const day = join(home, "sessions", "2026", "10", "21");
mkdirSync(day, { recursive: true });
const first = join(day, "rollout-2026-10-21T10-00-00-thread-zz.jsonl");
writeFileSync(
  first,
  jsonl([
    meta("thread-zz"),
    turn("2026-10-21T10:00:00.000Z", "t1", ABS),
    spawn("2026-10-21T10:00:01.000Z", { agent_type: "router_claude_subscription_abs_claude_sonnet_5_5" }),
    spawn("2026-10-21T10:00:02.000Z", { agent_type: "router_claude_api_oak_claude_opus_5_5" }),
    call("2026-10-21T10:00:03.000Z", "wait_agent", { timeout_ms: 60000 }),
    turn("2026-10-21T10:30:00.000Z", "t1", ABS), // compaction repeats the turn's context
    spawn("2026-10-21T10:30:01.000Z", { fork_turns: "all" }),
    spawn("2026-10-21T10:40:00.000Z", { agent_type: "router_claude_subscription_abs_claude_haiku_5_5" }),
    turn("2026-10-21T11:00:00.000Z", "t2", OAK_API),
    spawn("2026-10-21T11:00:01.000Z", { agent_type: "router_claude_api_oak_claude_haiku_5_5" }),
    turn("2026-10-21T12:00:00.000Z", "t3", OAK_API),
    interrupt("2026-10-21T12:00:01.000Z", "int-1", "/root/done_lane"),
    interruptResult("2026-10-21T12:00:01.100Z", "int-1", { completed: "Report written." }),
    interrupt("2026-10-21T12:00:02.000Z", "int-2", "/root/gone_lane"),
    interruptResult("2026-10-21T12:00:02.100Z", "int-2", "not_found"),
    interrupt("2026-10-21T12:00:03.000Z", "int-3", "/root/live_lane"),
    interruptResult("2026-10-21T12:00:03.100Z", "int-3", "running"),
  ]),
);
writeFileSync(
  join(day, "rollout-2026-10-21T13-00-00-thread-zz_next.jsonl"),
  jsonl([
    meta("thread-zz"),
    turn("2026-10-21T13:00:00.000Z", "t4", ABS),
    spawn("2026-10-21T13:00:01.000Z", { agent_type: "router_claude_subscription_abs_claude_opus_5_5" }),
    spawn("2026-10-21T13:00:30.000Z", { agent_type: "router_claude_subscription_abs_claude_sonnet_5_5" }),
  ]),
);
writeFileSync(
  join(day, "rollout-2026-10-21T14-00-00-other_thread-zz.jsonl"),
  jsonl([meta("other"), turn("2026-10-21T14:00:00.000Z", "o1", ABS), spawn("2026-10-21T14:00:01.000Z", { agent_type: "router_claude_api_oak_claude_opus_5_5" })]),
);
const run = (...args) => execFileSync("node", [script, ...args], { encoding: "utf8", env: { ...process.env, CODEX_HOME: home } });

test("counts distinct turns, splits batches at a wait or a 120 s gap, and flags a spawn on another account", () => {
  assert.equal(
    run(first, "--bars").trim(),
    "turns=3 delegated-turns=2 spawns=5 batches=4 parallel-batches=1 max-batch=2 inherit=1 cross-account=1 interrupts=3 interrupt-finished=2",
  );
  assert.match(run(first), /^ {2}2026-10-21T10:00:02\.000Z main claude-subscription-abs\/claude-opus-5-5 -> router_claude_api_oak_claude_opus_5_5$/m);
  assert.match(run(first), /^Interrupts 3; 2 went to agents that had already finished \(STANDING group 13\)\.$/m);
});

test("--since keeps the main model from before the window and follows a model switch", () => {
  assert.equal(
    run(first, "--since", "2026-10-21T10:35:00Z", "--bars").trim(),
    "turns=3 delegated-turns=2 spawns=2 batches=2 parallel-batches=0 max-batch=1 inherit=0 cross-account=0 interrupts=3 interrupt-finished=2",
  );
});

test("--thread reads every rollout file of the thread in order and skips files of other sessions", () => {
  assert.equal(
    run("--thread", "thread-zz", "--bars").trim(),
    "turns=4 delegated-turns=3 spawns=7 batches=5 parallel-batches=2 max-batch=2 inherit=1 cross-account=1 interrupts=3 interrupt-finished=2",
  );
});
