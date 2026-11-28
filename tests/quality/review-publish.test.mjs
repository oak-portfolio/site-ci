// Run: node --test tests/quality/review-publish.test.mjs (part of npm run test:quality).
// review-gallery --publish copies the version and capture folders into the served cache and exits non-zero unless
// review.html and every image it references return 200 from the review server.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const gallery = path.join(repo, "scripts/quality/review-gallery.mjs");
const server = path.join(repo, "scripts/quality/review-server.mjs");

// A fixture repo with review v1 and two capture folders, and an empty cache the real review server serves.
function fixture({ skipCapture } = {}) {
  const base = mkdtempSync(path.join(tmpdir(), "review-publish-"));
  const fixtureRepo = path.join(base, "repo"), cache = path.join(base, "cache");
  const version = path.join(fixtureRepo, "artifacts/premium-round/review/v1");
  mkdirSync(version, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const cells = ["artifacts/design-rework/review-v1/a-1280x800.png", "artifacts/premium-round/review/captures/live/b-1280x800.png"].map((rel, index) => {
    const file = path.join(fixtureRepo, rel);
    if (!(skipCapture && index === 1)) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, "png-bytes"); }
    return { id: `gallery:cell${index}@1280`, source: index ? "live" : "gallery", capture: file, viewport: "1280x800", title: `Cell ${index}`, status: "pass", note: "n", fix: "" };
  });
  writeFileSync(path.join(version, "manifest.json"), JSON.stringify({ version: "v1", date: "2026-10-26", commit: "abc", worker: "w", site: "s", groups: [{ id: "g1", title: "Group", cells }], changes: [] }));
  return { fixtureRepo, cache };
}

async function withReviewServer(cache, fn) {
  const port = 40000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [server, cache, String(port)], { stdio: ["ignore", "pipe", "ignore"] });
  await new Promise(resolve => child.stdout.once("data", resolve));
  try { return await fn(`http://127.0.0.1:${port}`); } finally { child.kill(); }
}

const publish = (fixtureRepo, cache, baseUrl) => spawnSync(process.execPath,
  [gallery, "--repo-root", fixtureRepo, "--publish", "--cache-dir", cache, "--base-url", baseUrl], { encoding: "utf8" });

test("--publish copies the version and capture folders and passes when every URL returns 200", async () => {
  const { fixtureRepo, cache } = fixture();
  await withReviewServer(cache, async baseUrl => {
    const run = publish(fixtureRepo, cache, baseUrl);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /publish: 3 folders copied/);
    assert.match(run.stdout, /review\.html 200; images 2\/2 return 200/);
  });
  for (const rel of ["artifacts/premium-round/review/v1/review.html", "artifacts/design-rework/review-v1/a-1280x800.png", "artifacts/premium-round/review/captures/live/b-1280x800.png"]) {
    assert.ok(existsSync(path.join(cache, rel)), rel);
  }
});

test("--publish exits non-zero when the server cannot find the page (the old \"not found\" failure)", async () => {
  const { fixtureRepo, cache } = fixture();
  const elsewhere = mkdtempSync(path.join(tmpdir(), "review-other-"));
  // The server serves a different folder than the one published into, so every URL is a 404.
  await withReviewServer(elsewhere, async baseUrl => {
    const run = publish(fixtureRepo, cache, baseUrl);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /publish FAIL review\.html 404/);
    assert.match(run.stdout, /images 0\/0 return 200/);
  });
});

test("--publish exits non-zero when a capture the manifest names is missing", async () => {
  const { fixtureRepo, cache } = fixture({ skipCapture: true });
  await withReviewServer(cache, async baseUrl => {
    const run = publish(fixtureRepo, cache, baseUrl);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /publish FAIL missing capture .*b-1280x800\.png/);
    assert.match(run.stdout, /images 1\/2 return 200/);
  });
});

test("--publish exits non-zero when the review server is not running", () => {
  const { fixtureRepo, cache } = fixture();
  const run = publish(fixtureRepo, cache, "http://127.0.0.1:1");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /review\.html unreachable/);
});

test("without --publish nothing is copied", () => {
  const { fixtureRepo, cache } = fixture();
  const run = spawnSync(process.execPath, [gallery, "--repo-root", fixtureRepo], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(path.join(cache, "artifacts")), false);
});
