// Run: node --test tests/quality/ci-browser-guards.test.mjs (part of npm run test:quality).
// CI installs Chromium and runs the node-only guard tests; these checks hold that wiring and the layout rules that need no browser.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../..");
const read = file => readFileSync(path.join(repo, file), "utf8");
const scripts = JSON.parse(read("package.json")).scripts;
const ciConfig = ".circleci/config.yml";

test("the owner console styles keep the four-card Usage grid: four columns, two from 800px down", () => {
  const css = read("src/styles/owner-console.css").replace(/\s+/g, " ");
  assert.match(css, /dl\.oc-grid--4 \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/, "four columns above 800px");
  assert.match(css, /@media \(max-width: 800px\) \{[^@]*dl\.oc-grid--4 \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/, "two columns at 800px and below");
});

test("tests/agent/openui stays node-only: no file imports playwright or names 127.0.0.1", () => {
  const dir = path.join(repo, "tests/agent/openui");
  const offenders = readdirSync(dir).filter(file => /playwright|chromium|127\.0\.0\.1/i.test(readFileSync(path.join(dir, file), "utf8")));
  assert.deepEqual(offenders, [], "move a browser test to tests/agent/openui-browser/");
});

test("test:agent:guards runs the node-only folder by glob, and CI calls it", () => {
  const words = scripts["test:agent:guards"]?.split(/\s+/) ?? [];
  assert.ok(words.includes("tests/agent/openui/*.test.mjs"), "the guard script takes the openui folder glob");
  assert.ok(!words.some(word => word.startsWith("tests/agent/openui-browser")), "no browser test in the guard script");
  assert.match(read(ciConfig), /command: npm run test:agent:guards/, `${ciConfig} runs the guards`);
});

test("CI installs Chromium with a cache keyed on the playwright version", () => {
  const text = read(ciConfig);
  assert.match(text, /npx playwright install --with-deps chromium/, "CI installs Chromium");
  assert.match(text, /require\('playwright\/package\.json'\)\.version/, "CI reads the installed playwright version");
  assert.match(text, /key: v1-playwright-chromium-\{\{ arch \}\}-\{\{ checksum "\.playwright-version" \}\}/, "CI keys the cache on the version");
});
