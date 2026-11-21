// Q25-G32: a site test file that no package script runs cannot catch anything, so every one is in a script or listed here
// with the reason it is out. Run: node --test tests/quality/scripted-tests.test.mjs
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Known out, each with its blocker. Fixing one means scripting it and deleting its line.
const unscripted = {
  "tests/agent/work-answer-quality-cli.test.mjs": "imports a TypeScript class with a parameter property, which Node's type stripping rejects",
  "tests/agent/work-answer-quality-native-export.test.mjs": "imports a TypeScript class with a parameter property, which Node's type stripping rejects",
  "tests/knowledge/lifecycle.test.mjs": "its fixture Astro build fails on a module it cannot find",
  "tests/knowledge/machine-owner.test.mjs": "its fixture Astro build fails on a module it cannot find",
};

const walk = (dir) => readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const globToRegExp = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
// Scripts that run with no browser: a file in one that drives Playwright fails on Depot ci (a11y-polish, g42f98z7xz).
const noBrowserScripts = ["test:agent:guards"];
const browserImport = /(?:from\s+|import\s*\(\s*)["'][^"']*playwright[^"']*["']/;

const filesIn = (text, files) => {
  const globs = [...text.matchAll(/tests\/[^\s"']*\*[^\s"']*/g)].map((match) => globToRegExp(match[0]));
  return files.filter((file) => text.includes(file) || globs.some((glob) => glob.test(file)));
};

export function unscriptedTests(scripts, files) {
  const scripted = new Set(filesIn(Object.values(scripts).join(" "), files));
  return files.filter((file) => !scripted.has(file));
}

export function browserTestsInNoBrowserScripts(scripts, files, read) {
  const text = noBrowserScripts.map((name) => scripts[name] ?? "").join(" ");
  return filesIn(text, files).filter((file) => browserImport.test(read(file)));
}

const siteTests = () => walk("tests").filter((file) => /\.test\.m?js$/.test(file)).map((file) => file.split(path.sep).join("/"));
const packageScripts = () => JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;

test("Q25-G32 every site test file runs in a package script or is listed with its blocker", () => {
  const files = siteTests();
  assert.deepEqual(unscriptedTests(packageScripts(), files).filter((file) => !unscripted[file]), []);
  for (const file of Object.keys(unscripted)) assert.ok(files.includes(file), `${file} is listed but no longer exists`);
});

test("Q25-G32 the scripted-test check finds a file no script names", () => {
  const scripts = { a: "node --test tests/quality/*.test.mjs tests/agent/one.test.mjs" };
  assert.deepEqual(unscriptedTests(scripts, ["tests/quality/x.test.mjs", "tests/agent/one.test.mjs", "tests/agent/two.test.mjs"]), ["tests/agent/two.test.mjs"]);
});

test("164 no test file in a no-browser script imports Playwright", () => {
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  assert.deepEqual(browserTestsInNoBrowserScripts(packageScripts(), siteTests(), read), [], "move these to a browser folder such as tests/agent/openui-browser/");
});

test("164 the browser-import check finds a Playwright file under a no-browser glob only", () => {
  const scripts = { "test:agent:guards": "node --test tests/agent/openui/*.test.mjs", "test:agent:ui": "node --test tests/agent/openui-browser/*.test.mjs" };
  const sources = {
    "tests/agent/openui/a.test.mjs": 'import AxeBuilder from "@axe-core/playwright";',
    "tests/agent/openui/b.test.mjs": 'import { galleryStates } from "../premium/gallery.mjs";',
    "tests/agent/openui/c.test.mjs": 'const { chromium } = await import("playwright");',
    "tests/agent/openui-browser/d.test.mjs": 'import { chromium } from "playwright";',
  };
  assert.deepEqual(browserTestsInNoBrowserScripts(scripts, Object.keys(sources), (file) => sources[file]), ["tests/agent/openui/a.test.mjs", "tests/agent/openui/c.test.mjs"]);
});
