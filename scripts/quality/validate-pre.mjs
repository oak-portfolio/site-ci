#!/usr/bin/env node
// Fast doomed-run guard for `npm run validate`, under 60 s. RETRO: validate ran 52 to 85 times at 12 to 19 minutes each,
// and many runs were already doomed at the start: the dev server had died with its shell, a gallery state had no row
// in the asset map, or lint failed. Each failure prints one line; any failure exits 1 before the long run starts.
//
// Usage: node scripts/quality/validate-pre.mjs [--url URL] [--lint-cmd "CMD"]
//   URL defaults to OAK_GALLERY_URL or http://127.0.0.1:4321, the server the UI suites use.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const statesFile = path.join(repo, "src/data/dev/oak-states.json");
export const assetMapFile = path.join(repo, "design/visual-integration/oak-agent-assets-v2.json");

/** The D64-G1 rule (tests/agent/design-rework/d64-asset-per-state.test.mjs): every gallery state has a row in the asset map. */
export const unmappedGalleryStates = (gallery, map) => gallery.map(state => state.id).filter(id => !map.states?.[id]);

/** The checkout a dev gallery serves, from its oak-dev-root meta (src/dev/oak-states.astro); null when the page has none. */
export const servedRoot = (html) => html.match(/<meta name="oak-dev-root" content="([^"]*)"/)?.[1] ?? null;

export async function checkDevServer(baseUrl, root = repo, timeoutMs = 4000) {
  const url = `${baseUrl.replace(/\/$/, "")}/__dev/oak-states`;
  const host = new URL(baseUrl).host;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return `dev server on ${host} is not answering; the UI suites need it (npm run dev:bg)`;
  }
  if (response.status !== 200) return `dev server on ${host} answered ${response.status} for /__dev/oak-states; the UI suites need it (npm run dev:bg)`;
  // Review wave 2: a 200 from another checkout's server would test that checkout's source.
  const served = servedRoot(await response.text()), want = realpathSync(root);
  if (served === null) return `dev server on ${host} does not say which checkout it serves (started before oak-dev-root); restart it from this checkout (npm run dev:stop && npm run dev:bg)`;
  if (served !== want) return `dev server on ${host} serves ${served}, not this checkout (${want}); stop it and run npm run dev:bg here`;
  return null;
}

export function checkGalleryMap(statesPath = statesFile, mapPath = assetMapFile) {
  const missing = unmappedGalleryStates(JSON.parse(readFileSync(statesPath, "utf8")), JSON.parse(readFileSync(mapPath, "utf8")));
  return missing.length ? `gallery state(s) with no row in ${path.relative(repo, mapPath)}: ${missing.join(", ")}` : null;
}

export function checkLint(command = "npm run -s lint") {
  const run = spawnSync(command, { cwd: repo, shell: true, encoding: "utf8", timeout: 50000 });
  return run.status === 0 ? null : `${command} failed (exit ${run.status ?? run.signal}); run it for the findings`;
}

/** Goal retro: d56-sign-in and mascot read git-ignored files under artifacts/, so a fresh checkout or worktree failed them
 * only after a full validate. Every literal `artifacts/...` path a UI or quality test reads must exist before the long run. */
export function missingTestArtifacts(root = repo, dirs = ["tests/agent", "tests/quality"]) {
  const wanted = new Set();
  const walk = dir => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.test\.m?[jt]s$/.test(entry.name)) {
        for (const match of readFileSync(full, "utf8").matchAll(/["'`](?:\.\.\/)+(artifacts\/[\w./-]+\.\w+)["'`]/g)) wanted.add(match[1]);
      }
    }
  };
  for (const dir of dirs) walk(path.join(root, dir));
  return [...wanted].filter(file => !existsSync(path.join(root, file))).sort();
}

export function checkTestArtifacts(root = repo) {
  const missing = missingTestArtifacts(root);
  return missing.length ? `test(s) read git-ignored file(s) this checkout lacks: ${missing.join(", ")} (copy them from the main checkout)` : null;
}

export async function runPre({ url, lintCommand, statesPath, mapPath, root }) {
  const failures = [
    await checkDevServer(url),
    checkGalleryMap(statesPath, mapPath),
    checkTestArtifacts(root ?? repo),
    checkLint(lintCommand),
  ].filter(Boolean);
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) { // realpath: a symlinked path such as /tmp still runs the script
  const argv = process.argv.slice(2);
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const failures = await runPre({
    url: option("--url") ?? process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321",
    lintCommand: option("--lint-cmd"),
    statesPath: option("--states-file"),
    mapPath: option("--map-file"),
    root: option("--artifacts-root"),
  });
  for (const line of failures) console.error(`validate:pre FAIL ${line}`);
  if (failures.length) process.exit(1);
  console.log("validate:pre ok: dev server answering, every gallery state mapped, lint clean");
}
