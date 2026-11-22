import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { walkFiles } from "./html.mjs";
import { parseArgs, saveJson } from "./browser-proof.mjs";

const AGENT_BASELINE_GZIP_BYTES = 447_381;

export const budget = {
  humanMachineBundleBytes: 200_000,
  agentIsland: {
    baselineGzipBytes: AGENT_BASELINE_GZIP_BYTES,
    ceilingGzipBytes: Math.round(AGENT_BASELINE_GZIP_BYTES * 1.15),
    prGrowthGzipBytes: 8 * 1024,
    lazyOnly: { dagre: "network-simplex", ProjectWall: "oak-wall__controls", StackMap: "oak-stack-map__venn", Table: "oak-table__frame", Board: "oak-board__newest", PageCards: "oak-page-card__look" },
  },
  minimumScriptTransferReduction: 0.1,
  tolerances: {
    "paint.lcpMs": { ratio: 0.1, absolute: 250 },
    "paint.cls": { ratio: 0, absolute: 0.02 },
    "resources.transferBytes": { ratio: 0.05, absolute: 10_000 },
    "execution.scriptDurationMs": { ratio: 0.25, absolute: 50 },
    "loading.hydrationMs": { ratio: 0.2, absolute: 500 },
  },
};

const staticImports = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[^;"'`()]*?from\s*)?["'](\.\/[^"']+\.js)["']/g;
const dynamicImports = /\bimport\(\s*[`"'](\.\/[^`"']+\.js)[`"']\s*\)/g;

function closure(starts, follow) {
  const seen = new Set();
  const queue = [...starts];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...follow(file));
  }
  return seen;
}

export function auditAgentIsland(dist, { base } = {}) {
  const findings = [];
  const entries = walkFiles(dist).filter((file) => /^OakWorkspace\..+\.js$/.test(path.basename(file)));
  if (entries.length !== 1) return { findings: ["Expected exactly one OakWorkspace JavaScript bundle"] };
  const text = new Map();
  const read = (file) => text.get(file) ?? text.set(file, readFileSync(file, "latin1")).get(file);
  const targets = (file, pattern) => [...read(file).matchAll(pattern)].map((match) => path.resolve(path.dirname(file), match[1]));
  const eager = closure(entries, (file) => targets(file, staticImports));
  const lazy = [...closure([...eager].flatMap((file) => targets(file, dynamicImports)), (file) => [...targets(file, staticImports), ...targets(file, dynamicImports)])]
    .filter((file) => !eager.has(file));
  const line = (file) => ({ file: path.relative(dist, file), bytes: statSync(file).size, gzipBytes: gzipSync(readFileSync(file)).length });
  const byName = (a, b) => a.file.localeCompare(b.file);
  const report = { entry: path.relative(dist, entries[0]), eager: [...eager].map(line).sort(byName), lazy: lazy.map(line).sort(byName) };
  report.eagerBytes = report.eager.reduce((sum, { bytes }) => sum + bytes, 0);
  report.eagerGzipBytes = report.eager.reduce((sum, { gzipBytes }) => sum + gzipBytes, 0);
  const { ceilingGzipBytes, prGrowthGzipBytes, lazyOnly } = budget.agentIsland;
  if (report.eagerGzipBytes > ceilingGzipBytes) findings.push(`The eager agent chunks are ${report.eagerGzipBytes} gzip bytes, over the ${ceilingGzipBytes} ceiling`);
  const growth = base?.agentIsland?.eagerGzipBytes === undefined ? null : report.eagerGzipBytes - base.agentIsland.eagerGzipBytes;
  if (growth !== null && growth > prGrowthGzipBytes) findings.push(`The eager agent chunks grew by ${growth} gzip bytes over the base build, more than ${prGrowthGzipBytes}`);
  for (const file of eager) {
    for (const [name, marker] of Object.entries(lazyOnly)) if (read(file).includes(marker)) findings.push(`${path.relative(dist, file)} carries ${name} into the eager agent chunks`);
  }
  return { ...report, growthGzipBytes: growth, findings };
}

export function auditBundle(dist, { base } = {}) {
  const files = walkFiles(dist).filter((file) => /^HumanMachineMode\..+\.js$/.test(path.basename(file)));
  const findings = [];
  if (files.length !== 1) findings.push("Expected exactly one HumanMachineMode JavaScript bundle");
  const bundles = files.map((file) => ({ file: path.relative(dist, file), bytes: statSync(file).size }));
  for (const bundle of bundles) {
    if (bundle.bytes > budget.humanMachineBundleBytes) findings.push(`${bundle.file} exceeds ${budget.humanMachineBundleBytes} bytes`);
  }
  const { findings: islandFindings, ...agentIsland } = auditAgentIsland(dist, { base });
  return { budget, bundles, agentIsland, findings: [...findings, ...islandFindings] };
}

const metricAt = (sample, metric) => metric.split(".").reduce((value, key) => value?.[key], sample.observations);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const keyOf = (sample) => `${sample.route}|${sample.viewport.name}`;

export function comparePerformance(baseline, candidate) {
  const findings = [];
  const comparisons = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(baseline.browser, candidate.browser)) findings.push("Browser versions differ");
  if (!same(baseline.environment, candidate.environment)) findings.push("Measurement settings differ");
  const required = ["resources.scriptTransferBytes", ...Object.keys(budget.tolerances)];
  const groups = (report) => {
    const result = new Map();
    for (const sample of report.results ?? []) {
      const key = keyOf(sample);
      result.set(key, [...(result.get(key) ?? []), sample]);
      const observation = sample.observations;
      if (observation.httpStatus !== 200 || observation.pageErrors?.length || observation.consoleErrors?.length ||
          observation.failedScriptRequests?.length || !observation.loading?.scriptsSettled ||
          observation.loading.clientLoadHydratedCount !== observation.loading.clientLoadIslandCount ||
          required.some((metric) => !Number.isFinite(metricAt(sample, metric)))) {
        findings.push(`${report.build}: invalid sample ${key} #${sample.sample}`);
      }
    }
    return result;
  };
  const beforeGroups = groups(baseline);
  const afterGroups = groups(candidate);
  if (!beforeGroups.size || !same([...beforeGroups.keys()].sort(), [...afterGroups.keys()].sort())) findings.push("Route/viewport coverage differs or is empty");
  for (const [key, before] of beforeGroups) {
    const after = afterGroups.get(key);
    if (!after) continue;
    if (before.length < 3 || before.length !== after.length || new Set(before.map((sample) => sample.sample)).size !== before.length || new Set(after.map((sample) => sample.sample)).size !== after.length) {
      findings.push(`${key}: at least three distinct matched samples are required`);
    }
    if (!before.every((sample) => same(sample.viewport, before[0].viewport)) || !after.every((sample) => same(sample.viewport, before[0].viewport))) findings.push(`${key}: viewport settings differ`);
    const metrics = {};
    for (const metric of required) {
      const baselineMedian = median(before.map((sample) => metricAt(sample, metric)));
      const candidateMedian = median(after.map((sample) => metricAt(sample, metric)));
      const change = candidateMedian - baselineMedian;
      metrics[metric] = { baseline: baselineMedian, candidate: candidateMedian, change, changePercent: baselineMedian ? change / baselineMedian * 100 : null };
      if (metric === "resources.scriptTransferBytes") {
        if (candidateMedian > baselineMedian * (1 - budget.minimumScriptTransferReduction)) findings.push(`${key}: JavaScript transfer must fall by at least 10%`);
      } else {
        const tolerance = budget.tolerances[metric];
        if (change > Math.max(baselineMedian * tolerance.ratio, tolerance.absolute)) findings.push(`${key}: ${metric} regressed beyond the lab tolerance`);
      }
    }
    comparisons.push({ route: before[0].route, viewport: before[0].viewport.name, sampleCount: before.length, metrics });
  }
  return { budget, baseline: baseline.build, candidate: candidate.build, comparisons, findings, status: findings.length ? "fail" : "pass", limitation: "Local lab medians, not field Core Web Vitals or a search-ranking claim." };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  let report;
  if (args.baseline || args.candidate) {
    if (!args.baseline || !args.candidate) throw new Error("Use both --baseline and --candidate performance-report.json paths");
    report = comparePerformance(JSON.parse(readFileSync(args.baseline, "utf8")), JSON.parse(readFileSync(args.candidate, "utf8")));
  } else {
    report = auditBundle(path.resolve(args.dist ?? "dist"), { base: args.base ? JSON.parse(readFileSync(args.base, "utf8")) : undefined });
  }
  if (args.out) await saveJson(path.resolve(args.out), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.findings.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
