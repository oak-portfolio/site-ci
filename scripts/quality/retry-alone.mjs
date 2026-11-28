#!/usr/bin/env node
// Timing-flake guard for the UI suites. RETRO: load flakes in timing tests cost whole validate reruns.
// Runs `node --test` on the given files. Failed files are rerun once together at the same concurrency, so a failure that
// depends on what else is running still shows. Files that still fail (or are the only failure, where a batch equals a solo
// run) are rerun alone with `node --test`:
//   - fails alone too: a real failure, exit 1.
//   - passes alone: `flake-retry: <file> passed alone (order-dependent?)`; exit 1 unless the file is on the timing
//     allowlist below or named with --timing-allow=a,b (names match the start of the file name).
//   - passes in the together rerun (two or more failed files): `flake-retry: <file> passed on rerun`, accepted.
//   - a deterministic suite (deterministicList or --deterministic=a,b) that fails is a real failure at once, never rerun.
//
// Usage: node scripts/quality/retry-alone.mjs [--test-concurrency=N] [--timing-allow=NAME,...] [--deterministic=NAME,...] <test files...>
import { spawnSync } from "node:child_process";
import path from "node:path";
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

// Known load-timing tests (RETRO and PLAN call these the load flakes); anything else that passes only alone is an ordering bug.
// r12-account R12-G2 reads the disc mid-transition (ruling 75: red on the land-24 mirror run, green on rerun and alone; batch touches no account file).
// d115-live-stream samples the thought's typing every 40 ms like d78 (ruling 73: red at concurrency 3 on the mirror, green alone).
// q07-cards samples the answer card's staggered reveal every 40 ms; under a loaded run the stagger can finish between samples.
// d73-card-parts samples the same staggered reveal every 60 ms (red under load on 124 ui and land-31 run 3, green alone both times).
export const timingAllowlist = ["d114-review-fixes", "d20-assets", "d30-hover-hints", "d85-menu-glide", "d36-stall", "d69-ring-and-motion", "d73-card-parts", "d78-reasoning-flow", "d79-busy-hero", "d115-live-stream", "q07-cards", "r12-account"];

export const isTimingTest = (file, allow = timingAllowlist) => allow.some(name => path.basename(file).startsWith(name));

// Ticket 147: design-judge's gallery pass takes about 17 minutes, so two reruns pushed the ui job past its 60-minute cap and
// lost the findings line. Its only timing is the 4 s settle wait, which reports a `settle` finding by name, so a failure is
// reported once with its findings; these suites also stay out of the together rerun even when they passed.
export const deterministicList = ["design-judge"];

export const isDeterministic = (file, list = deterministicList) => list.some(name => path.basename(file).startsWith(name));

export async function runAll(files, concurrency) {
  const failed = new Set();
  const stream = run({ files: files.map(file => path.resolve(file)), concurrency });
  stream.on("test:fail", event => { if (event.file) failed.add(event.file); });
  stream.compose(spec).pipe(process.stdout);
  await new Promise(resolve => stream.on("end", resolve));
  return [...failed];
}

// NODE_TEST_CONTEXT would turn a nested run into a silent child of an outer `node --test`.
export const runAlone = file => {
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  return spawnSync(process.execPath, ["--test", file], { stdio: "inherit", env }).status === 0;
};

export async function retryAlone(files, concurrency = 1, allow = timingAllowlist, fixed = deterministicList) {
  const failed = await runAll(files, concurrency);
  if (!failed.length) return 0;
  let code = 0;
  for (const file of failed.filter(file => isDeterministic(file, fixed))) {
    console.log(`flake-retry: ${path.relative(process.cwd(), file)} failed and is deterministic, so it is not rerun`);
    code = 1;
  }
  const first = failed.filter(file => !isDeterministic(file, fixed));
  const rerun = files.filter(file => !isDeterministic(file, fixed));
  let stillFailing = first;
  if (first.length > 1) {
    // Review wave 2: the whole list reruns, so a passing file that interfered with a failed one runs beside it again; only
    // the files that failed the first time are judged.
    console.log(`flake-retry: rerunning all ${rerun.length} files at concurrency ${concurrency} to judge ${first.length} failed files together`);
    const again = new Set(await runAll(rerun, concurrency));
    stillFailing = first.filter(file => again.has(file));
    for (const file of first.filter(file => !stillFailing.includes(file))) {
      console.log(`flake-retry: ${path.relative(process.cwd(), file)} passed on rerun`);
    }
  }
  for (const file of stillFailing) {
    const shown = path.relative(process.cwd(), file);
    console.log(`flake-retry: rerunning ${shown} alone`);
    if (!runAlone(file)) { console.log(`flake-retry: ${shown} failed alone too (a real failure)`); code = 1; }
    else if (isTimingTest(file, allow)) console.log(`flake-retry: ${shown} passed alone (order-dependent?) but is on the timing allowlist`);
    else { console.log(`flake-retry: ${shown} passed alone (order-dependent?)`); code = 1; }
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) { // realpath: a symlinked path such as /tmp still runs the script
  const args = process.argv.slice(2);
  const concurrencyArg = args.find(arg => arg.startsWith("--test-concurrency="));
  const allowArg = args.find(arg => arg.startsWith("--timing-allow="));
  const fixedArg = args.find(arg => arg.startsWith("--deterministic="));
  const allow = [...timingAllowlist, ...(allowArg ? allowArg.split("=")[1].split(",").filter(Boolean) : [])];
  const fixed = [...deterministicList, ...(fixedArg ? fixedArg.split("=")[1].split(",").filter(Boolean) : [])];
  const files = args.filter(arg => !arg.startsWith("--"));
  if (!files.length) { console.error("usage: retry-alone.mjs [--test-concurrency=N] [--timing-allow=NAME,...] [--deterministic=NAME,...] <test files...>"); process.exit(2); }
  process.exitCode = await retryAlone(files, concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 1, allow, fixed);
}
