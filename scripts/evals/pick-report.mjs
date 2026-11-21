#!/usr/bin/env node
// Ticket 08: does the model pick one component for the right questions before it is taught?
// Usage: node scripts/evals/pick-report.mjs (--run --out <qa/NN> [--teach Name,...] [--repeats 4] | --from <programs/*.json>)
//          [--component <Name> --baseline <qa/08/baseline.json>] [--save <file.json>]
//   --run runs workers/oak-agent/evals/arrange.eval.ts on the real model (about $0.003 a call) and saves its programs and stream
//   timings to <out>/programs/; --from reports a saved run again, offline. --teach builds the candidate arrange prompt in memory.
//   --component and --baseline print the SPEC bar's verdict (SPEC.md "Pick eval bar"); --save writes the stats (baseline.json, pick.json).
//   A run with a failed test or a suite error, or a --teach run whose arrange call was never taught, fails the verdict and is never
//   saved by --save; a baseline with no sets fails every verdict.
// No-regression rule (PICK_RULE), robust to noise at 4 runs a set over the 14 baseline sets (56 runs):
//   - fallbacks and byte cuts are pooled over the baseline sets; the candidate may exceed the baseline rate by `slack` (2) runs.
//     At a true 1% fallback rate against a 0-fallback baseline that fails 1.9% of clean probes (the per-set literal rule: 43%).
//     One set that gains `setFallbacks` (2) or more fallbacks over its own baseline rate fails on its own.
//   - a component the baseline picked in more than half of a set's runs fails when it falls to a quarter (1 of 4) or less, or
//     when `halvedChecks` (3) or more such checks fall to half (2 of 4), or when `halvedPerComponent` (2) of them name one
//     component. Priced on qa/08/baseline.json (qa/96/rule-sim.out, 4000 trials): false fails about 4% at a true 95% pick rate,
//     2.5% at a 1% fallback rate, 9.5% at both. Answer and Sources are scaffolding every layout carries (the required root, and "End with
//     Sources"), so they make no check; Pills is optional and does.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateSystemPrompt } from "@openuidev/lang-core";
import { oakOpenUIGenerated } from "../openui/build-prompt.mjs";
import { BYTE_CUT, componentCounts } from "../quality/live-health-core.mjs";
import { loadTsx } from "../../tests/agent/design-rework/load-tsx.mjs";
import { oakEvalFragments } from "../../workers/oak-agent/evals/openui/loader.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const FRAGMENT_DIR = `${root}workers/oak-agent/evals/openui/`;

/** The component fragments in `dir` (names starting with a letter); the numbered 00-06 baseline files are skipped. The arrange eval reads every file. */
export async function oakEvalFragmentsIn(dir = FRAGMENT_DIR) {
  const modules = {};
  for (const file of existsSync(dir) ? readdirSync(dir).sort() : []) {
    const full = path.join(dir, file);
    if (file.endsWith(".probe.json")) modules[`./${file}`] = JSON.parse(readFileSync(full, "utf8"));
    else if (file.endsWith(".cases.ts")) modules[`./${file}`] = await import(pathToFileURL(full).href);
  }
  return oakEvalFragments(modules);
}

/** `--teach`: the arrange prompt the prompt library would give with `names` taught too, in memory only (taught.json and system-prompt.ts stay). */
export function oakTeachPrompt(libraries, names) {
  const { oakRenderLibrary, oakPromptLibrary } = libraries, rendered = Object.keys(oakRenderLibrary.components);
  for (const name of names) {
    if (!rendered.includes(name)) throw new Error(`pick-report: ${name} is not in the render library`);
    if (name in oakPromptLibrary.components) throw new Error(`pick-report: ${name} is taught already`);
  }
  const remove = rendered.filter(name => !(name in oakPromptLibrary.components) && !names.includes(name));
  const candidate = oakRenderLibrary.extend({ components: { remove, override: libraries.oakTaughtArgs.filter(component => !remove.includes(component.name)) } });
  const spec = JSON.parse(oakOpenUIGenerated({ ...libraries, oakPromptLibrary: candidate })["spec.json"]);
  return generateSystemPrompt({ library: spec, promptOptions: spec.promptOptions });
}

export const oakCandidatePrompt = names => names.length ? oakTeachPrompt(loadTsx("src/lib/openui.tsx"), names) : "";

export const oakProgramComponents = program => [...new Set([...(program ?? "").matchAll(/^\s*[\w-]+\s*=\s*([A-Z]\w*)\(/gm)].map(match => match[1]))];

export const PICK_RULE = { slack: 2, setFallbacks: 2, dropped: 1 / 4, halved: 1 / 2, halvedChecks: 3, halvedPerComponent: 2, structural: ["Answer", "Sources"] };

/** The probe's vitest JSON report as a saved run: set ids, programs, reasons, timings, test status and swaps, never the question or claim text.
 *  A suite that failed with no assertions (a collect or import error), or a report that failed with nothing else to blame, is a suite error. */
export function oakPickRecord(report, { teach, repeats }) {
  const tests = report.testResults.flatMap(file => file.assertionResults);
  const runs = tests.filter(test => test.meta?.arrange).map(({ status, meta: { arrange: run } }) => ({ set: run.id, status: run.status, program: run.program,
    streamed: run.streamed ?? "", reasons: run.reasons ?? [], totalMs: run.totalMs, firstStreamMs: run.firstStreamMs, stream: run.stream ?? [],
    settledMicroUsd: run.settledMicroUsd ?? [], passed: status === "passed", taught: run.taught ?? 0 }));
  const failedTests = tests.filter(test => test.status === "failed").length;
  const suiteErrors = report.testResults.filter(file => file.status === "failed" && !file.assertionResults?.length).length;
  return { kind: "arrange-probe", teach, ...(repeats ? { repeats } : {}), failedTests, suiteErrors: suiteErrors || (report.success === false && !failedTests ? 1 : 0), runs };
}

export function oakSaveRun(record, out, now = new Date()) {
  const file = path.join(out, "programs", `arrange-${now.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-")}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 1)}\n`);
  return file;
}

/** Picks per set, and picks, fallbacks and byte-cap cuts per component; a fallback counts against what its streamed program named (`reached`).
 *  The Worker's settle drops a component not yet taught, so a done run also picks each --teach name its streamed program wrote. */
export function oakPickStats(record) {
  const teach = record.teach ?? [];
  const done = run => [...new Set([...oakProgramComponents(run.program), ...oakProgramComponents(run.streamed).filter(name => teach.includes(name))])];
  const items = record.runs.map(run => ({ set: run.set, outcome: run.status, components: run.status === "done" ? done(run) : oakProgramComponents(run.streamed),
    reason: run.reasons.includes(BYTE_CUT) ? BYTE_CUT : run.reasons[0] }));
  const sets = {};
  for (const item of items) {
    const entry = sets[item.set] ??= { runs: 0, fallbacks: 0, byteCuts: 0, picks: {}, reached: {} };
    entry.runs++;
    if (item.outcome !== "done") {
      entry.fallbacks++;
      if (item.reason === BYTE_CUT) entry.byteCuts++;
      for (const name of item.components) entry.reached[name] = (entry.reached[name] ?? 0) + 1;
    }
    else for (const name of item.components) entry.picks[name] = (entry.picks[name] ?? 0) + 1;
  }
  const fallbacks = items.filter(item => item.outcome !== "done");
  const failedTests = record.failedTests ?? record.runs.filter(run => run.passed === false).length, suiteErrors = record.suiteErrors ?? 0;
  const untaught = teach.length ? record.runs.filter(run => !run.taught).length : 0;
  const problems = [...(failedTests ? [`${failedTests} failed tests`] : []), ...(suiteErrors ? [`${suiteErrors} suite errors`] : []), ...(untaught ? [`${untaught} untaught runs`] : [])];
  return { runs: items.length, fallbacks: fallbacks.length, byteCuts: fallbacks.filter(item => item.reason === BYTE_CUT).length,
    settledMicroUsd: record.runs.flatMap(run => run.settledMicroUsd).reduce((sum, value) => sum + (value ?? 0), 0), failedTests, suiteErrors, untaught, problems,
    sets, ...componentCounts(items) };
}

/** SPEC "Pick eval bar": 3 of 4 on each shape set, 0 of 4 on each negative set, and the baseline sets keep their rates and majority picks (PICK_RULE).
 *  A shape set's `moves` names baseline sets that ask its question for the old layout: those are graded 3 of 4 on the component instead. */
export function oakPickVerdict(stats, { component, sets, baseline }) {
  const checks = [], add = (set, check, ok, detail = "") => checks.push({ set, check, ok, detail });
  const mine = sets.filter(set => set.component === component), shapes = mine.filter(set => !set.negative), negatives = mine.filter(set => set.negative);
  const moved = new Set(shapes.flatMap(set => set.moves ?? []));
  add(component, "run clean", !stats.problems?.length,
    `${stats.failedTests ?? 0} failed tests, ${stats.suiteErrors ? `${stats.suiteErrors} suite errors, ` : ""}${stats.untaught ?? 0} untaught runs`);
  if (!shapes.length) add(component, "has a shape set", false);
  if (!negatives.length) add(component, "has a negative set", false);
  const picked = id => ({ runs: stats.sets[id]?.runs ?? 0, picks: stats.sets[id]?.picks[component] ?? 0, reached: stats.sets[id]?.reached?.[component] ?? 0 });
  for (const { id } of shapes) { const { runs, picks } = picked(id); add(id, "picked 3 of 4", runs >= 4 && picks * 4 >= runs * 3, `${picks} of ${runs}`); }
  for (const { id } of negatives) {
    const { runs, picks, reached } = picked(id);
    add(id, "picked 0 of 4", runs >= 4 && picks === 0 && reached === 0, `${picks} of ${runs}${reached ? `, streamed in ${reached} fallbacks` : ""}`);
  }
  const pool = { now: { runs: 0, fallbacks: 0, byteCuts: 0 }, base: { runs: 0, fallbacks: 0, byteCuts: 0 } }, halved = [];
  add("baseline sets", "has sets", Object.keys(baseline.sets ?? {}).length > 0, baseline.sets ? "" : "the baseline file has no sets");
  for (const [id, base] of Object.entries(baseline.sets ?? {})) {
    if (!base.runs) { add(id, "has runs", false, "the baseline set has no runs"); continue; }
    const now = stats.sets[id];
    if (!now) { add(id, "ran", false); continue; }
    for (const key of ["runs", "fallbacks", "byteCuts"]) { pool.now[key] += now[key]; pool.base[key] += base[key]; }
    if (moved.has(id)) { const picks = now.picks[component] ?? 0; add(id, `moves to ${component}`, now.runs >= 4 && picks * 4 >= now.runs * 3, `${picks} of ${now.runs}`); }
    else for (const [name, picks] of Object.entries(base.picks)) if (picks * 2 > base.runs && !PICK_RULE.structural.includes(name)) {
      const share = (now.picks[name] ?? 0) / now.runs, detail = `${now.picks[name] ?? 0}/${now.runs} vs ${picks}/${base.runs}`;
      if (share > PICK_RULE.halved) add(id, `keeps ${name}`, true, detail);
      else if (share > PICK_RULE.dropped) halved.push([id, name, detail]);
      else add(id, `keeps ${name}`, false, detail);
    }
    const gained = now.fallbacks - base.fallbacks * now.runs / base.runs;
    add(id, "fallbacks no higher", gained < PICK_RULE.setFallbacks, `${now.fallbacks}/${now.runs} vs ${base.fallbacks}/${base.runs}`);
  }
  const named = name => halved.filter(([, other]) => other === name).length;
  for (const [id, name, detail] of halved) add(id, `keeps ${name}`, halved.length < PICK_RULE.halvedChecks && named(name) < PICK_RULE.halvedPerComponent,
    `${detail}, ${halved.length} checks at half, ${named(name)} on ${name}`);
  if (pool.base.runs) for (const [key, label] of [["fallbacks", "fallbacks no higher"], ["byteCuts", "byte cuts no higher"]]) {
    const allowed = pool.base[key] * pool.now.runs / pool.base.runs + PICK_RULE.slack;
    add("baseline sets", label, pool.now[key] <= allowed, `${pool.now[key]}/${pool.now.runs} vs ${pool.base[key]}/${pool.base.runs}, up to ${Math.floor(allowed)} allowed`);
  }
  return { component, pass: checks.every(check => check.ok), checks };
}

/** `run-quality-eval.mjs --teach`: the arrange call runs only in the default lane (chat.ts skips saver), so a teach run is that lane alone and labeled. */
export function oakQualityTeach({ teach, lane, report }) {
  const name = lane ?? (report || teach.length ? "default" : "both"), lanes = name === "both" && !report ? ["default", "saver"] : [name];
  if (teach.length && name !== "default") throw new Error(`run-quality-eval: --teach needs the default lane (saver never arranges), not ${lane}`);
  return { lanes, label: teach.length ? `teach-${teach.join("+")}` : null };
}

/** A teach lane that swapped no prompt, or an arranged answer that went out on the committed prompt, measured nothing taught. */
export function oakTeachUntaught(results, teach) {
  if (!teach.length) return null;
  if (!results.some(result => result.taught > 0)) return "--teach: the lane taught nothing (no arrange call carried the committed prompt)";
  const untaught = results.filter(result => result.ui && !(result.taught > 0)).length;
  return untaught ? `--teach: ${untaught} arranged answers went out untaught` : null;
}

function probe({ teach, repeats }) {
  const out = "/tmp/oak-pick-probe.json", prompt = oakCandidatePrompt(teach);
  rmSync(out, { force: true });
  const run = spawnSync("npx", ["vitest", "run", "--config", "vitest.eval.config.ts", "evals/arrange.eval.ts", "--reporter=json", `--outputFile=${out}`],
    { cwd: `${root}workers/oak-agent/`, stdio: "ignore", env: { ...process.env, OAK_EVAL_ARRANGE_REPEATS: String(repeats), OAK_EVAL_TEACH_PROMPT: prompt } });
  if (!existsSync(out)) throw new Error(`pick-report: the probe produced no report (vitest exit ${run.status})`);
  return JSON.parse(readFileSync(out, "utf8"));
}

async function main() {
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const teach = arg("--teach")?.split(",").map(name => name.trim()).filter(Boolean) ?? [];
  if (!process.argv.includes("--run") && !arg("--from")) throw new Error("pick-report: --run --out <dir> or --from <programs.json>");
  let record;
  if (process.argv.includes("--run")) {
    if (!arg("--out")) throw new Error("pick-report: --run needs --out <qa/NN>");
    const repeats = Number(arg("--repeats") ?? 4);
    if (!Number.isInteger(repeats) || repeats < 1) throw new Error(`pick-report: --repeats needs a whole number of runs a set, not ${arg("--repeats")}`);
    record = oakPickRecord(probe({ teach, repeats }), { teach, repeats });
    console.log(`programs ${oakSaveRun(record, arg("--out"))}`);
  } else record = JSON.parse(readFileSync(arg("--from"), "utf8"));
  const stats = oakPickStats(record), component = arg("--component");
  const verdict = component && arg("--baseline")
    ? oakPickVerdict(stats, { component, sets: (await oakEvalFragmentsIn()).sets, baseline: JSON.parse(readFileSync(arg("--baseline"), "utf8")) }) : null;
  const saved = { teach: record.teach, ...stats, ...(verdict ? { verdict } : {}) };
  if (arg("--save") && stats.problems.length) throw new Error(`pick-report: not saving ${arg("--save")}: ${stats.problems.join(", ")}`);
  if (arg("--save")) {
    writeFileSync(`${arg("--save")}.tmp`, `${JSON.stringify(saved, null, 1)}\n`);
    renameSync(`${arg("--save")}.tmp`, arg("--save"));
  }
  console.log(`${stats.runs} runs, ${stats.fallbacks} fallbacks, ${stats.byteCuts} byte cuts, spend $${(stats.settledMicroUsd / 1e6).toFixed(4)}${record.teach.length ? `, taught ${record.teach.join(", ")}` : ""}`);
  console.log(`rule: fallbacks and byte cuts pooled over the baseline sets, up to ${PICK_RULE.slack} runs above the baseline rate, and under ${PICK_RULE.setFallbacks} more in any one set; a majority pick fails at a quarter or less, or when ${PICK_RULE.halvedChecks}+ fall to half or ${PICK_RULE.halvedPerComponent}+ on one component; ${PICK_RULE.structural.join(" and ")} not counted`);
  for (const problem of stats.problems) console.log(`FAIL run ${problem}`);
  for (const [name, entry] of Object.entries(stats.components).filter(([name]) => !PICK_RULE.structural.includes(name)).sort(([a], [b]) => a.localeCompare(b)))
    console.log(`${name}: picked ${entry.picks} of ${stats.runs} (${Math.round(entry.picks / stats.runs * 100)}%), fallbacks ${entry.fallbacks}, byte cuts ${entry.byteCuts}`);
  for (const check of verdict?.checks.filter(check => !check.ok) ?? []) console.log(`FAIL ${check.set} ${check.check} ${check.detail}`);
  if (verdict) console.log(`${verdict.component} ${verdict.pass ? "meets" : "misses"} the pick bar`);
  process.exitCode = (verdict && !verdict.pass) || stats.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
