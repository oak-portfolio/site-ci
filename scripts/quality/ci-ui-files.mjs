#!/usr/bin/env node
// Picks one CircleCI node's share of test:agent:ui for the manual `ui` workflow in .circleci/config.yml and prints the
// retry-alone.mjs arguments, one per line. Node 0 runs design-judge alone (its gallery pass is the longest suite, about
// 17 minutes); the other nodes take the remaining files round-robin. Left out on every node, and named on stderr: files
// that read a git-ignored artifacts/ file a CI checkout lacks, and files with a known Linux rendering difference. The
// local `npm run validate` still runs both kinds.
//   node scripts/quality/ci-ui-files.mjs <node index from 0> <node count>
//   node scripts/quality/ci-ui-files.mjs --self-test
import { globSync, readFileSync } from "node:fs";

// Linux Chromium draws a classic 15 px scrollbar, so Q24-G11 in r8-review-v5 measures 1425 px where macOS gives 1440.
const LINUX_DIFFERENCES = ["tests/agent/design-rework/r8-review-v5.test.mjs"];
const ALONE = "tests/agent/premium/design-judge.test.mjs";
const CONCURRENCY = "--test-concurrency=3"; // 4 vCPU shared with the dev server and Chromium

export function share(files, index, count) {
  const rest = files.filter(file => file !== ALONE);
  const mine = count < 2 ? files : index === 0 ? files.filter(file => file === ALONE) : rest.filter((_, i) => i % (count - 1) === index - 1);
  // node --test with no file arguments would discover and run every test in the repository.
  if (!mine.length) throw new Error(`node ${index} of ${count} got no UI files${index === 0 ? ` (${ALONE} was left out)` : ""}`);
  return mine;
}

if (process.argv[2] === "--self-test") {
  const files = [ALONE, ...Array.from({ length: 11 }, (_, i) => `tests/agent/x${i}.test.mjs`)];
  const shares = [0, 1, 2, 3].map(index => share(files, index, 4));
  const placed = shares.flat();
  if (placed.length !== files.length || new Set(placed).size !== files.length) throw new Error("a file is missing or on two nodes");
  if (shares[0].length !== 1 || shares[0][0] !== ALONE) throw new Error("design-judge is not alone on node 0");
  let caught = false;
  try { share(files.slice(1), 0, 4); } catch { caught = true; }
  if (!caught) throw new Error("an empty share was not refused");
  console.log(`ci-ui-files self-test ok: node sizes ${shares.map(s => s.length).join(", ")}`);
} else {
  const [index, count] = process.argv.slice(2).map(Number);
  const { missingTestArtifacts } = await import("./validate-pre.mjs");
  const missing = missingTestArtifacts();
  const words = JSON.parse(readFileSync("package.json", "utf8")).scripts["test:agent:ui"].split(/\s+/).slice(2);
  const files = words.filter(word => !word.startsWith("--")).flatMap(word => (word.includes("*") ? globSync(word).sort() : [word]));
  const skipped = files.filter(file => LINUX_DIFFERENCES.includes(file) || missing.some(artifact => readFileSync(file, "utf8").includes(artifact)));
  const mine = share(files.filter(file => !skipped.includes(file)), index, count);
  console.error(`node ${index + 1}/${count}: ${mine.length} UI files. Left out on every node (missing artifacts or a Linux difference): ${skipped.join(", ") || "none"}`);
  const flags = words.filter(word => word.startsWith("--")).map(word => (word.startsWith("--test-concurrency=") ? CONCURRENCY : word));
  console.log([...flags, ...mine].join("\n"));
}
