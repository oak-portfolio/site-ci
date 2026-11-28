// Run: node --test tests/quality/no-private-routes.test.mjs (part of npm run test:quality).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.resolve(import.meta.dirname, "../../scripts/quality/no-private-routes.mjs");

function fixtureDist(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "no-private-routes-"));
  for (const [file, body] of Object.entries({ "index.html": "<a href=\"/work\">Work</a>", "_astro/app.js": "fetch('/api/oak/chat')", ...files })) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), body);
  }
  return dir;
}
const run = dir => spawnSync(process.execPath, [script, dir], { encoding: "utf8" });

test("a public-only dist passes", () => {
  const result = run(fixtureDist({}));
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, files, finding] of [
  ["an owner page", { "owner/console/index.html": "<h1>Owner console</h1>" }, /owner\/console\/index\.html/],
  ["an owner services page", { "owner/services.html": "<h1>Service usage</h1>" }, /owner\/services\.html/],
  ["a __dev page", { "__dev/oak-states/index.html": "<h1>States</h1>" }, /__dev\/oak-states/],
  ["the token proxy's refusal code", { "_astro/owner.js": "x={error:'owner-proxy-same-origin-only'}" }, /owner-proxy-same-origin-only/],
  ["the owner token's Keychain service", { "_astro/key.js": "'oak-owner-api-token'" }, /oak-owner-api-token/],
  ["a link to an owner page", { "work/index.html": "<a href=\"/owner/console\">Console</a>" }, /work\/index\.html/],
  ["a link to a __dev page", { "index.html": "<a href='/__dev/oak-states'>States</a>" }, /index\.html/],
]) test(`a dist with ${name} fails and names it`, () => {
  const result = run(fixtureDist(files));
  assert.equal(result.status, 1);
  assert.match(result.stderr, finding);
});

test("the owner API path alone is not a page or a proxy reference", () => {
  const result = run(fixtureDist({ "_astro/agent.js": "const u='/api/oak/owner/usage'" }));
  assert.equal(result.status, 0, result.stderr);
});

test("a missing dist is an error, not a pass", () => {
  const result = run(path.join(tmpdir(), "no-such-dist-61"));
  assert.equal(result.status, 2);
});

test("the guard still runs from a checkout whose path holds a space", () => {
  const checkout = path.join(mkdtempSync(path.join(tmpdir(), "no-private-routes-space-")), "Oak X");
  mkdirSync(path.join(checkout, "scripts/quality"), { recursive: true });
  const copy = path.join(checkout, "scripts/quality/no-private-routes.mjs");
  copyFileSync(script, copy);
  const dist = fixtureDist({ "owner/console/index.html": "<h1>Owner console</h1>" });
  const result = spawnSync(process.execPath, [copy, dist], { encoding: "utf8", cwd: checkout });
  assert.equal(result.status, 1, `exit ${result.status}, stderr: ${result.stderr}`);
  assert.match(result.stderr, /owner\/console\/index\.html/);
});
