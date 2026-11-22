// Run: node --test tests/quality/validate-pre.test.mjs (part of npm run test:quality).
// validate:pre must fail fast, with one line each, on a dead dev server, an unmapped gallery state and a failing lint.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkGalleryMap, missingTestArtifacts } from "../../scripts/quality/validate-pre.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repo, "scripts/quality/validate-pre.mjs");

const fixtures = (states, mapStates) => {
  const dir = mkdtempSync(path.join(tmpdir(), "validate-pre-"));
  const statesFile = path.join(dir, "states.json"), mapFile = path.join(dir, "map.json");
  writeFileSync(statesFile, JSON.stringify(states.map(id => ({ id }))));
  writeFileSync(mapFile, JSON.stringify({ states: Object.fromEntries(mapStates.map(id => [id, {}])), assets: {} }));
  // An empty tree for the artifacts check, so these runs do not depend on this checkout's git-ignored files.
  return ["--states-file", statesFile, "--map-file", mapFile, "--artifacts-root", dir];
};

// The gallery page names the checkout it serves (src/dev/oak-states.astro); by default the fixture serves this one.
const withServer = async (status, fn, served = realpathSync(repo)) => {
  const body = served === null ? "<html></html>" : `<html><head><meta name="oak-dev-root" content="${served}" /></head></html>`;
  const server = createServer((req, res) => { res.writeHead(req.url === "/__dev/oak-states" ? status : 404); res.end(body); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
};

// Async spawn: the fixture server lives in this process, so a blocking spawn would starve it.
const pre = (url, args, lint = "true") => new Promise(resolve => {
  const child = spawn(process.execPath, [script, "--url", url, "--lint-cmd", lint, ...args], { cwd: repo });
  let stdout = "", stderr = "";
  child.stdout.on("data", d => { stdout += d; });
  child.stderr.on("data", d => { stderr += d; });
  child.on("close", status => resolve({ status, stdout, stderr }));
});

test("passes when the server answers, every state is mapped and lint is clean", async () => {
  await withServer(200, async url => {
    const run = await pre(url, fixtures(["a", "b"], ["a", "b", "extra"]));
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /validate:pre ok/);
  });
});

test("fails when the dev server serves another checkout, and names both", async () => {
  await withServer(200, async url => {
    const run = await pre(url, fixtures(["a"], ["a"]));
    assert.equal(run.status, 1);
    assert.match(run.stderr, /serves \/elsewhere\/oak-validate, not this checkout/);
  }, "/elsewhere/oak-validate");
});

test("fails when the dev server does not say which checkout it serves", async () => {
  await withServer(200, async url => {
    const run = await pre(url, fixtures(["a"], ["a"]));
    assert.equal(run.status, 1);
    assert.match(run.stderr, /does not say which checkout it serves/);
  }, null);
});

test("fails with one line when the dev server is not answering", async () => {
  const closed = await withServer(200, async url => url);
  const run = await pre(closed, fixtures(["a"], ["a"]));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /validate:pre FAIL dev server on 127\.0\.0\.1:\d+ is not answering/);
  assert.equal(run.stderr.trim().split("\n").length, 1);
});

test("fails when the gallery route answers something other than 200", async () => {
  await withServer(500, async url => {
    const run = await pre(url, fixtures(["a"], ["a"]));
    assert.equal(run.status, 1);
    assert.match(run.stderr, /answered 500/);
  });
});

test("fails naming a gallery state with no asset-map row", async () => {
  await withServer(200, async url => {
    const run = await pre(url, fixtures(["a", "brand-new-state"], ["a"]));
    assert.equal(run.status, 1);
    assert.match(run.stderr, /validate:pre FAIL gallery state\(s\) with no row in .*brand-new-state/);
  });
});

test("fails when lint fails", async () => {
  await withServer(200, async url => {
    const run = await pre(url, fixtures(["a"], ["a"]), "false");
    assert.equal(run.status, 1);
    assert.match(run.stderr, /validate:pre FAIL false failed \(exit 1\)/);
  });
});

test("reports every doomed reason at once", async () => {
  const closed = await withServer(200, async url => url);
  const run = await pre(closed, fixtures(["a", "b"], ["a"]), "false");
  assert.equal(run.stderr.trim().split("\n").length, 3);
});

test("the committed gallery states all have an asset-map row (the D64-G1 rule)", () => {
  assert.equal(checkGalleryMap(), null);
});

// Built by concatenation so the scanner never finds this path as a literal in its own test file.
const fakeArtifact = ["artifacts", "design-rework", "shot.png"].join("/");

test("names a git-ignored artifact a test reads when this checkout lacks it", async () => {
  const { mkdirSync } = await import("node:fs");
  const root = mkdtempSync(path.join(tmpdir(), "validate-pre-artifacts-"));
  mkdirSync(path.join(root, "tests/agent/design-rework"), { recursive: true });
  writeFileSync(path.join(root, "tests/agent/design-rework/d99.test.mjs"),
    `statSync(new URL("../../../${fakeArtifact}", import.meta.url));\n`);
  assert.deepEqual(missingTestArtifacts(root), ["artifacts/design-rework/shot.png"]);
  mkdirSync(path.join(root, "artifacts/design-rework"), { recursive: true });
  writeFileSync(path.join(root, "artifacts/design-rework/shot.png"), "x");
  assert.deepEqual(missingTestArtifacts(root), []);
});

test("the scanner does not flag its own test file, even when a checkout has the real artifacts", async () => {
  const { copyFileSync, mkdirSync } = await import("node:fs");
  const root = mkdtempSync(path.join(tmpdir(), "validate-pre-self-"));
  mkdirSync(path.join(root, "tests/quality"), { recursive: true });
  copyFileSync(fileURLToPath(import.meta.url), path.join(root, "tests/quality/validate-pre.test.mjs"));
  assert.deepEqual(missingTestArtifacts(root), []);
});
