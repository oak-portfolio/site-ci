import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import stylelint from "stylelint";
import { stepFloor, tokenScale } from "../../scripts/design-policy/css-plugin.mjs";
import { runDesignLint } from "../../scripts/design-policy/run.mjs";

const cssFixture = "tests/design-policy/fixtures/design-rework.css";
const lintCss = async (code) => (await stylelint.lint({ code, codeFilename: path.resolve(cssFixture), cache: false })).results
  .flatMap((result) => result.warnings).filter((warning) => warning.rule === "portfolio/agent-tokens");

test("ARCH@34 the radius floor reads its px scale from the token sheets, not a hand-copied table", () => {
  const scale = tokenScale();
  for (const [name, px] of Object.entries({ "radius-md": 24, "radius-lg": 32, "oak-r-frame": 48, "oak-r-sheet": 48, "oak-r-card": 24, "oak-r-row": 16, "space-xs": 8, "space-sm": 16 })) {
    assert.equal(scale[name], px, name);
  }
  const global = fs.readFileSync("src/styles/global.css", "utf8");
  const agent = fs.readFileSync("src/styles/oakAgent.css", "utf8");
  assert.equal(stepFloor("calc(var(--oak-r-card) - var(--space-xs))"), true);
  // A token change moves the judgement: shrink the frame by 8px (40) and the card less 8px falls under the 16px floor.
  const smaller = tokenScale([global, agent.replace("--oak-r-frame: calc(var(--radius-lg) + var(--space-sm));", "--oak-r-frame: calc(var(--radius-lg) + var(--space-xs));")]);
  assert.equal(smaller["oak-r-card"], 16);
  assert.equal(smaller["oak-r-row"], 16, "max() keeps the row floor");
  assert.equal(stepFloor("calc(var(--oak-r-card) - var(--space-xs))", smaller), false);
});

test("ARCH@34 the research card takes the sheet step like the rest of the answer family", async () => {
  assert.equal((await lintCss(".oak-research { border-radius: var(--oak-r-card); }")).length, 1);
  assert.equal((await lintCss(".oak-workspace .oak-research { border-radius: var(--oak-r-card); }")).length, 1);
  assert.deepEqual(await lintCss(".oak-research { border-radius: var(--oak-r-sheet); }"), []);
  assert.deepEqual(await lintCss(".oak-research { border-radius: var(--oak-card-radius, var(--radius-md)); }"), []);
  assert.deepEqual(await lintCss(".oak-research__card { border-radius: var(--oak-r-card); }"), [], "nested parts keep the card step");
});

test("ARCH@34 agent and ui letter-spacing must be 0", async () => {
  for (const value of ["-0.01em", "0.08em", "1px"]) {
    const found = await lintCss(`.oak-turn__title { letter-spacing: ${value}; }`);
    assert.equal(found.length, 1, value);
    assert.match(found[0].text, /letter-spacing must be 0/);
  }
  for (const value of ["0", "0px", "normal"]) assert.deepEqual(await lintCss(`.ui-chart__label { letter-spacing: ${value}; }`), [], value);
});

test("ARCH@34 a scoped lint covers only the named sources and skips the whole-tree syntax count", async () => {
  const result = await runDesignLint({ print: false, only: ["src/styles/oakOwner.css"] });
  assert.equal(result.css.results.length, 1);
  assert.deepEqual(result.js, []);
  assert.equal(result.counts.css, 1);
  const none = await runDesignLint({ print: false, only: [] });
  assert.equal(none.errors, 0);
  assert.equal(none.css.results.length, 0);
});

// A throwaway index (GIT_INDEX_FILE) built from HEAD stages blobs without touching the shared worktree's index or disk.
function withIndex(staged) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arch34-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, "index") };
  execFileSync("git", ["read-tree", "HEAD"], { env });
  for (const [file, text] of Object.entries(staged)) {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: text, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${blob},${file}`], { env });
  }
  const run = spawnSync(process.execPath, ["scripts/lint-design.mjs", "--staged"], { env, encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return run;
}
const headText = (file) => execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" });

test("ARCH@34 review: --staged lints the staged blob, so a violation staged then restored on disk still fails", () => {
  const file = "src/styles/oakOwner.css";
  const run = withIndex({ [file]: `${headText(file)}\n.oak-owner-probe { letter-spacing: 0.08em; }\n` });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /oakOwner\.css.*letter-spacing must be 0/);
  assert.match(run.stdout, /\(1 of \d+ files\): 1 findings/);
  const clean = withIndex({ [file]: `${headText(file)}\n/* probe */\n` });
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
});

test("ARCH@34 review: a staged token sheet (oakAgent.css) widens --staged to every tracked source", () => {
  const file = "src/styles/oakAgent.css";
  const run = withIndex({ [file]: `${headText(file)}\n/* probe */\n` });
  const linted = Number(/\((\d+) of \d+ files\)/.exec(run.stdout)?.[1]);
  assert(linted > 200, run.stdout + run.stderr);
});
