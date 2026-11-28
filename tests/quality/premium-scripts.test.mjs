// Run: node --test tests/quality/premium-scripts.test.mjs (part of npm run test:quality).
// Every premium UI test runs somewhere: in validate (test:agent:ui) or in the per-round slow sweep, never both, never neither.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scripts = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")).scripts;
const listed = (name) => scripts[name].split(/\s+/).filter(word => word.startsWith("tests/agent/premium/"));

test("each tests/agent/premium/*.test.mjs is in exactly one of test:agent:ui and test:agent:premium:slow", () => {
  const files = readdirSync(path.join(repo, "tests/agent/premium")).filter(file => file.endsWith(".test.mjs")).map(file => `tests/agent/premium/${file}`);
  const ui = new Set(listed("test:agent:ui")), slow = new Set(listed("test:agent:premium:slow"));
  assert.deepEqual(files.filter(file => !ui.has(file) && !slow.has(file)), [], "a premium test no script runs");
  assert.deepEqual(files.filter(file => ui.has(file) && slow.has(file)), [], "a premium test both scripts run");
  assert.deepEqual([...ui, ...slow].filter(file => !files.includes(file)), [], "a listed premium test that does not exist");
});

test("tests/agent/openui/*.test.mjs is listed once in test:agent:ui and once in test:agent:guards", () => {
  const glob = "tests/agent/openui/*.test.mjs";
  const everywhere = Object.values(scripts).flatMap(script => script.split(/\s+/)).filter(word => word.startsWith("tests/agent/openui/"));
  assert.deepEqual(everywhere, [glob, glob], "the folder is run by its glob and nothing names one of its files");
  assert.ok(scripts["test:agent:ui"].split(/\s+/).includes(glob), "test:agent:ui runs the folder");
  assert.ok(scripts["test:agent:ui"].split(/\s+/).includes("tests/agent/openui-browser/*.test.mjs"), "test:agent:ui runs the browser folder");
});

test("tests/agent/e2e/*.test.mjs is listed exactly once, as one glob in test:agent:ui", () => {
  const glob = "tests/agent/e2e/*.test.mjs";
  const everywhere = Object.values(scripts).flatMap(script => script.split(/\s+/)).filter(word => word.startsWith("tests/agent/e2e/"));
  assert.deepEqual(everywhere, [glob, "tests/agent/e2e/public-contracts.test.mjs"], "the folder is run by its glob and nothing names one of its files");
  assert.ok(scripts["test:agent:ui"].split(/\s+/).includes(glob), "test:agent:ui runs the folder");
});
