#!/usr/bin/env node
// Read-only owner operations inside one guarded workers.dev window. RETRO (R31): every retirement check and survey was a
// fresh /tmp script that switched workers.dev on and off itself, hard-coded the authority hash, and lost the guards
// owner-redeploy.mjs has. This is the one way to run owner reads; it shares owner-redeploy's off switch and authority lookup.
//
// Usage: node scripts/quality/owner-read.mjs <op>... [--out FILE] [--authority SHA256] [--apply]
//   op: owner-status, status=<id>, header=<id> (any 64-hex candidate id, ADR 0005), or the older fixed aliases
//   status-<id8> and header-<id8> (read-only operations only). Default is a dry run.
//   --apply switches workers.dev on, runs owner-status (retried while workers.dev warms up) and every op, then always
//   switches workers.dev off, also on failure or Ctrl-C. Prints one summary JSON line and writes it to --out when given.
// Exit: 0 all reads 200 and workers.dev switched off, 1 a read failed, 3 workers.dev may still be ON, 2 usage error.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { execute, offConfig, offPath, ownerConfig, profile, resolveInputs } from "./owner-redeploy.mjs";

const readOp = /^(owner-status|(status|header)-[a-f0-9]{8}|(status|header)=[a-f0-9]{64})$/;
const sha256 = /^[a-f0-9]{64}$/;
const ownerControl = path.join(path.dirname(fileURLToPath(import.meta.url)), "owner-control.mjs");
const usage = "owner-status, status=<id>, header=<id>, status-<id8>, header-<id8>";

export function parseArgs(argv) {
  const options = { ops: [], apply: false, out: undefined, authority: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--out" || arg === "--authority") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Expected a value after ${arg}`);
      options[arg.slice(2)] = value;
      i += 1;
    } else if (readOp.test(arg)) options.ops.push(arg);
    else throw new Error(`Not a read-only owner operation: ${arg} (${usage}; an id is 64 lowercase hex)`);
  }
  if (options.authority !== undefined && !sha256.test(options.authority)) throw new Error("--authority must be a 64-character lowercase hex sha256");
  if (!options.ops.includes("owner-status")) options.ops.unshift("owner-status");
  return options;
}

/** control.mjs prints one JSON line { op, status, out, preview }. Anything else (a crash on a non-JSON reply, such as the
 * HTML Cloudflare serves while workers.dev warms up, or a retired id) becomes { status: null, error }, never a throw. */
export function parseControl(stdout, stderr = "") {
  const line = (stdout ?? "").trim().split("\n").pop() ?? "";
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object" && "status" in parsed) return parsed;
  } catch {}
  return { status: null, error: `unreadable control reply: ${(stderr || line).trim().split("\n").pop()?.slice(0, 160) ?? ""}` };
}

/** Retained quota from an owner-status body: the first `generations` and `bytes` objects that carry a local bound. */
export function quotaFrom(body) {
  const found = {};
  const walk = node => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if ((key === "generations" || key === "bytes") && value && typeof value === "object" && "localBound" in value) found[key] ??= value.localBound;
      else walk(value);
    }
  };
  walk(body);
  return found;
}

/** The fields a retirement or survey check compares between runs. */
export function candidateSummary(body) {
  if (!body || typeof body !== "object") return null;
  const steps = Array.isArray(body.steps) ? body.steps : [];
  return {
    state: body.state,
    staging: Boolean(body.stagingResource),
    openSteps: steps.filter(step => !step.completed).map(step => step.stepId),
    cleanup: body.cleanup ? { phase: body.cleanup.phase, deleted: body.cleanup.deleted } : null,
  };
}

/** One read step. A fixed name goes through control.mjs; `status=<id>` and `header=<id>` go through owner-control.mjs,
 * which sends the id to the id-taking read (`status-by-id`, `header-by-id`). */
export function readStep(op, authority, controlDir) {
  const id = /^(status|header)=([a-f0-9]{64})$/.exec(op);
  if (id) return { label: op, op, command: "node", args: [ownerControl, id[1] === "status" ? "status-by-id" : "header-by-id", id[2], authority, "--dir", controlDir] };
  return { label: op, op, command: "node", args: [path.join(controlDir, "control.mjs"), op, authority] };
}

export function buildSteps({ ops, authority, controlDir }) {
  return {
    on: { label: "workers.dev on", command: "npx", args: ["wrangler", "triggers", "deploy", "-c", ownerConfig, "--profile", profile] },
    reads: ops.map(op => readStep(op, authority, controlDir)),
    off: { label: "workers.dev off", copyOff: true, detached: true, command: "npx", args: ["wrangler", "triggers", "deploy", "-c", offConfig, "--profile", profile] },
  };
}

const readBody = file => { try { return JSON.parse(readFileSync(file, "utf8")).body; } catch { return undefined; } };

/** Runs the off step at most once per process, whether from the window's finally or a signal; false on any error. */
let offOnce;
export function switchOff(step, run = execute) {
  offOnce ??= (async () => { try { return (await run(step)).status === 0; } catch { return false; } })();
  return offOnce;
}
export const resetSwitchOff = () => { offOnce = undefined; };

/** Ctrl-C, SIGTERM or SIGHUP mid-window: switch workers.dev off first, then exit 130, or 3 when the off step failed. */
export function offOnSignal(step, { run = execute, exit = code => process.exit(code), on = (signal, handler) => process.once(signal, handler), log = console } = {}) {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) on(signal, async () => {
    for (const again of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(again, () => {});
    log.error(`owner-read interrupted by ${signal}; switching workers.dev off`);
    const off = await switchOff(step, run);
    if (!off) log.error("owner-read: workers.dev off FAILED; oak-rag-setup-owner may still answer on workers.dev");
    exit(off ? 130 : 3);
  });
}

/** Runs the window. `run(step)` resolves { status, stdout, stderr }. The off step runs once the on step has started. */
export async function readWindow(steps, { statusTries = 6, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), body = readBody } = {}, run = execute) {
  const summary = { at: new Date().toISOString(), reads: {}, workersDevOff: false };
  try {
    const on = await run(steps.on);
    summary.workersDevOn = on.status === 0;
    if (on.status !== 0) return { summary, code: 1 };
    for (const step of steps.reads) {
      const read = async () => { const out = await run(step); return parseControl(out.stdout, out.stderr); };
      let result = await read();
      for (let attempt = 1; step.op === "owner-status" && result.status !== 200 && attempt < statusTries; attempt++) { await wait(5000); result = await read(); }
      const payload = result.out ? body(result.out) : undefined;
      summary.reads[step.op] = { http: result.status, ...(result.error ? { error: result.error } : {}), ...(step.op === "owner-status" ? { quota: quotaFrom(payload) } : { candidate: candidateSummary(payload) }) };
    }
  } finally {
    summary.workersDevOff = await switchOff(steps.off, run);
  }
  if (!summary.workersDevOff) return { summary, code: 3 };
  return { summary, code: Object.values(summary.reads).every(read => read.http === 200) ? 0 : 1 };
}

export async function main(argv) {
  const options = parseArgs(argv);
  const { authority, controlDir } = await resolveInputs({ authority: options.authority });
  const steps = buildSteps({ ops: options.ops, authority: authority ?? "<authority-sha256>", controlDir });
  if (!options.apply) {
    console.log("owner-read dry run (add --apply to run):");
    [steps.on, ...steps.reads, steps.off].forEach((step, index) => console.log(`${index + 1}. ${step.label}: ${step.command} ${step.args.join(" ")}`));
    return 0;
  }
  if (!authority) throw new Error("No authority hash: pass --authority, set OAK_OWNER_AUTHORITY_SHA256, or keep the reviewed serving packet in source");
  process.on("exit", () => rmSync(offPath, { force: true }));
  offOnSignal(steps.off);
  const { summary, code } = await readWindow(steps);
  const line = JSON.stringify(summary);
  if (options.out) writeFileSync(options.out, `${JSON.stringify(summary, null, 1)}\n`);
  console.log(line);
  if (code === 3) console.error("owner-read: workers.dev off FAILED; oak-rag-setup-owner may still answer on workers.dev. Run: node scripts/quality/owner-read.mjs owner-status --apply");
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
