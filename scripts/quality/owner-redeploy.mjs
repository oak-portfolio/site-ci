#!/usr/bin/env node
// Owner Worker redeploy as one script. RETRO: oak-rag-setup-owner was redeployed by hand about 10 times, and the
// order matters (owner-status answers only while workers.dev is on). The steps are the ones in
// docs/planning/oak-ai-agent-2026-10-03/goal-prompts/STANDING.md ("oak-rag-setup-owner") and the header of
// scripts/quality/owner-deploy-check.mjs:
//   1 stale check -> 2 deploy -> 3 owner status -> 4 workers.dev off -> 5 stale check
//
// Usage: node scripts/quality/owner-redeploy.mjs [--apply] [--force] [--install] [--authority SHA256] [--account ID]
//   Default is a dry run that prints each command. --apply runs them. --force deploys even when owner-stale=0.
//   --install runs the owner `install` operation right after owner status, while workers.dev is still on. Use it after a
//   re-seal (scripts/reseal-serving-packet.ts): the owner keeps its stored certificate, limits and housekeeping alarm
//   until install runs (R31).
//   --apply refuses unless the working tree is clean and the owner paths match origin/main (the closing stale check
//   reads origin/main, so deploying local-only code would report fresh). Once the deploy step ran, workers.dev is always
//   switched off again, even when owner status or the deploy itself failed. The stale check is read from its
//   `owner-stale=N` output line, not its exit code. The temporary config is git-ignored and removed on exit or SIGINT.
// The authority hash comes from --authority, OAK_OWNER_AUTHORITY_SHA256, the reviewed serving packet in source (the code
// being deployed), or the newest owner-status-*.json under .local-setup/p13-serving of the main checkout. R31: a re-seal
// changes the hash, so the newest receipt is stale right after one; the packet comes first. The setup secret never passes
// through here: control.mjs reads it from the Keychain in-process.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ownerConfig = "workers/oak-agent/setup/wrangler.jsonc";
export const offConfig = "workers/oak-agent/setup/wrangler.workers-dev-off.jsonc";
export const profile = "oak-agent-native";
const rolloutPlan = "docs/planning/oak-ai-agent-2026-10-03/production-rollout/p13-rag-plan.md";
const packetSource = "workers/oak-agent/src/knowledge/production-retrieval.ts";
// Keep in step with OWNER_PATHS in owner-deploy-check.mjs (a test compares them); that script runs on import, so no import.
export const ownerPaths = ["workers/oak-agent/src/setup", "workers/oak-agent/src/knowledge", "workers/oak-agent/setup", "packages/oak-agent-contracts/src"];
const sha256 = /^[a-f0-9]{64}$/;

export function parseArgs(argv) {
  const options = { apply: false, force: false, install: false, authority: undefined, account: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--install") options.install = true;
    else if (arg === "--authority" || arg === "--account") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Expected a value after ${arg}`);
      options[arg.slice(2)] = value;
      i += 1;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.authority !== undefined && !sha256.test(options.authority)) throw new Error("--authority must be a 64-character lowercase hex sha256");
  if (options.account !== undefined && !/^[a-f0-9]{32}$/.test(options.account)) throw new Error("--account must be a 32-character Cloudflare account id");
  return options;
}

/** The retrieval account id the owner is deployed with, as the rollout plan records it (an id, not a secret). */
export function accountFromDocs(root = repo) {
  const text = readFileSync(path.join(root, rolloutPlan), "utf8");
  return /"RETRIEVAL_ACCOUNT_ID": "([a-f0-9]{32})"/.exec(text)?.[1];
}

/** The main checkout holds the git-ignored .local-setup; a worktree finds it through the shared git dir. */
export function mainCheckout() {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: repo, encoding: "utf8" }).trim();
  return path.dirname(common);
}

export function authorityFromLocalSetup(dir) {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter(name => /^owner-status-\d+\.json$/.test(name)).sort((a, b) => parseInt(b.slice(13), 10) - parseInt(a.slice(13), 10));
  for (const name of files) {
    const hash = JSON.parse(readFileSync(path.join(dir, name), "utf8"))?.body?.authoritySha256;
    if (typeof hash === "string" && sha256.test(hash)) return hash;
  }
  return undefined;
}

/** The authority hash of the reviewed serving packet in `file`, computed the way servingAssembly() does. Undefined when
 * the file or its packet literal is missing. Parsed like scripts/reseal-serving-packet.ts, so no Worker module loads. */
export async function authorityFromPacket(file = path.join(repo, packetSource)) {
  if (!existsSync(file)) return undefined;
  const source = readFileSync(file, "utf8");
  const marker = source.indexOf("export const reviewedServingPacket");
  if (marker < 0) return undefined;
  const start = source.indexOf("= {", marker) + 2, end = source.indexOf("\n};\n", start) + 2;
  if (start < 2 || end < 2) return undefined;
  const { hashJson } = await import(pathToFileURL(path.join(repo, "workers/oak-agent/src/knowledge/embedding-plan.ts")).href);
  return hashJson(["oak.serving-packet.v1", JSON.parse(source.slice(start, end))]);
}

/** Builds the ordered steps. Each is { label, command, args } or { label, run } for the in-process workers.dev switch. */
export function buildPlan({ account, authority, controlDir, install = false }) {
  const control = path.join(controlDir, "control.mjs");
  return [
    { label: "stale check", command: "node", args: ["scripts/quality/owner-deploy-check.mjs"], expectStale: 1 },
    { label: "deploy owner", command: "npx", args: ["wrangler", "deploy", "-c", ownerConfig, "--var", `RETRIEVAL_ACCOUNT_ID:${account}`, "--profile", profile] },
    { label: "owner status", command: "node", args: [control, "owner-status", authority] },
    ...(install ? [{ label: "install certificate", command: "node", args: [control, "install", authority] }] : []),
    { label: "workers.dev off", copyOff: true, command: "npx", args: ["wrangler", "triggers", "deploy", "-c", offConfig, "--profile", profile] },
    { label: "stale check again", command: "node", args: ["scripts/quality/owner-deploy-check.mjs"], expectStale: 0 },
  ];
}

export const show = step => `${step.command} ${step.args.map(arg => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`;

export async function resolveInputs(options) {
  const controlDir = process.env.OAK_OWNER_LOCAL_SETUP_DIR ?? path.join(mainCheckout(), ".local-setup/p13-serving");
  const account = options.account ?? accountFromDocs();
  const packet = process.env.OAK_SERVING_PACKET_SOURCE ?? path.join(repo, packetSource);
  const authority = options.authority ?? process.env.OAK_OWNER_AUTHORITY_SHA256 ?? await authorityFromPacket(packet) ?? authorityFromLocalSetup(controlDir);
  if (!account) throw new Error(`No retrieval account id: pass --account or restore it in ${rolloutPlan}`);
  if (authority !== undefined && !sha256.test(authority)) throw new Error("OAK_OWNER_AUTHORITY_SHA256 must be a 64-character lowercase hex sha256");
  return { account, authority, controlDir };
}

/** Runs one command, echoing its output; resolves { status, stdout, stderr }. A `detached` step runs in its own process
 * group, so a terminal Ctrl-C cannot kill it (the workers.dev off switch must finish). */
function spawnStep(step) {
  return new Promise(resolve => {
    const child = spawn(step.command, step.args, { cwd: repo, stdio: ["inherit", "pipe", "pipe"], detached: Boolean(step.detached) });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", chunk => { stderr += chunk; process.stderr.write(chunk); });
    child.on("error", () => resolve({ status: 127, stdout, stderr }));
    child.on("close", status => resolve({ status, stdout, stderr }));
  });
}

export const offPath = path.join(repo, offConfig);
const removeOffConfig = () => rmSync(offPath, { force: true });

export async function execute(step) {
  if (step.copyOff) {
    // wrangler reads workers_dev from the config, so the off switch deploys triggers from a temporary copy. It sits next to the
    // real config because wrangler resolves paths relative to it, and .gitignore lists it.
    const source = readFileSync(path.join(repo, ownerConfig), "utf8");
    if (!/"workers_dev":\s*true/.test(source)) throw new Error(`${ownerConfig} has no "workers_dev": true to switch off`);
    writeFileSync(offPath, source.replace(/"workers_dev":\s*true/, '"workers_dev": false'));
  }
  try {
    return await spawnStep(step);
  } finally {
    if (step.copyOff) removeOffConfig();
  }
}

/** The stale check's verdict: its `owner-stale=N` line, or undefined when the script crashed before printing one. */
export const parseStale = stdout => {
  const match = /\bowner-stale=([01])\b/.exec(stdout ?? "");
  return match ? Number(match[1]) : undefined;
};

/** Refuses a deploy of anything that is not what origin/main holds, because the closing stale check reads origin/main. */
export function preflight(git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" })) {
  if (git("status", "--porcelain", "--untracked-files=no").trim()) return "the working tree is not clean; commit or stash first (the owner must be deployed from merged code)";
  git("fetch", "-q", "origin", "main");
  try { git("diff", "--quiet", "origin/main", "--", ...ownerPaths); } catch {
    return "the owner paths differ from origin/main; merge first, then redeploy from main (git diff origin/main -- " + ownerPaths.join(" ") + ")";
  }
  return null;
}

/** Runs the plan. `run(step)` resolves { status, stdout }. Step 4 (workers.dev off) always runs once step 2 has started. */
export async function applyPlan(plan, { force = false, statusTries = 4, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}, run = execute, log = console) {
  const step = label => plan.find(s => s.label === label);
  const [staleCheck, deploy, ownerStatus, install, off, staleAgain] = ["stale check", "deploy owner", "owner status", "install certificate", "workers.dev off", "stale check again"].map(step);
  const say = (_index, s) => log.log(`owner-redeploy ${plan.indexOf(s) + 1}/${plan.length} ${s.label}`);
  say(0, staleCheck);
  const first = await run(staleCheck);
  const stale = parseStale(first.stdout);
  if (stale === undefined) { log.error(`owner-redeploy stopped: ${staleCheck.label} printed no owner-stale=N line (exit ${first.status})`); return 1; }
  if (stale === 0 && !force) { log.log("owner-stale=0: nothing to redeploy (use --force to deploy anyway)"); return 0; }

  let code = 0;
  say(1, deploy);
  try {
    const deployed = await run(deploy);
    if (deployed.status !== 0) { log.error(`owner-redeploy: ${deploy.label} exited ${deployed.status}`); code = 1; }
    else {
      say(2, ownerStatus);
      // R30: workers.dev answers a few seconds after the deploy turns it on; until then Cloudflare serves an HTML page.
      let status = await run(ownerStatus);
      for (let attempt = 1; status.status !== 0 && attempt < statusTries; attempt++) { await wait(5000); status = await run(ownerStatus); }
      if (status.status !== 0) { log.error(`owner-redeploy: ${ownerStatus.label} exited ${status.status}; switching workers.dev off anyway`); code = 1; }
      else if (install) {
        // One attempt only: install is not retried blind, the owner keeps its old certificate on failure.
        say(0, install);
        const installed = await run(install);
        if (installed.status !== 0) { log.error(`owner-redeploy: ${install.label} exited ${installed.status}; switching workers.dev off anyway`); code = 1; }
      }
    }
  } finally {
    say(3, off);
    const offResult = await run(off);
    if (offResult.status !== 0) { log.error(`owner-redeploy: ${off.label} exited ${offResult.status}; workers.dev may still be ON for oak-rag-setup-owner`); code = 1; }
  }
  if (code) return code;
  say(4, staleAgain);
  const last = await run(staleAgain);
  if (parseStale(last.stdout) !== 0) { log.error(`owner-redeploy: ${staleAgain.label} did not report owner-stale=0 (exit ${last.status})`); return 1; }
  return 0;
}

/** Deletes `file` when this process exits or is interrupted (Ctrl-C), so a temporary config never outlives the run. */
export function removeOnExit(file) {
  const remove = () => rmSync(file, { force: true });
  process.on("exit", remove);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => { remove(); console.error(`owner-redeploy interrupted by ${signal}; if the deploy step had run, switch workers.dev off by hand`); process.exit(130); });
  }
}

export async function main(argv) {
  const options = parseArgs(argv);
  const inputs = await resolveInputs(options);
  if (options.apply && !inputs.authority) throw new Error("No authority hash: pass --authority, set OAK_OWNER_AUTHORITY_SHA256, or keep an owner-status-*.json under .local-setup/p13-serving");
  const plan = buildPlan({ ...inputs, install: options.install, authority: inputs.authority ?? "<authority-sha256>" });
  if (!options.apply) {
    console.log("owner-redeploy dry run (add --apply to run):");
    plan.forEach((step, index) => console.log(`${index + 1}. ${step.label}: ${show(step)}${step.copyOff ? "  [from a temporary copy with workers_dev false]" : ""}`));
    return 0;
  }
  const refused = preflight();
  if (refused) throw new Error(`owner-redeploy refused: ${refused}`);
  removeOnExit(offPath);
  return applyPlan(plan, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) { // realpath: a symlinked path such as /tmp still runs the script
  try { process.exitCode = await main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
