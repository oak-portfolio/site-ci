import test from "node:test";
import assert from "node:assert/strict";
import { blockingAdvisories } from "../../scripts/audit-deps.mjs";

const audit = (severity = "high") => ({
  vulnerabilities: {
    picomatch: {
      severity,
      via: [{ url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf", severity, title: "ReDoS" }],
    },
    tinyglobby: { severity, via: ["picomatch"] },
  },
});
const now = new Date("2026-11-17T00:00:00Z");
const listed = (expires) => [{ ghsa: "GHSA-fc5q-39xc-vjpf", reason: "build-time only", expires }];

test("audit exceptions: an unlisted High advisory fails", () => {
  assert.deepEqual(blockingAdvisories(audit(), [], now).map((a) => a.ghsa), ["GHSA-fc5q-39xc-vjpf"]);
});

test("audit exceptions: a listed unexpired advisory passes", () => {
  assert.deepEqual(blockingAdvisories(audit(), listed("2026-12-01"), now), []);
});

test("audit exceptions: an expired exception fails", () => {
  assert.equal(blockingAdvisories(audit(), listed("2026-11-16"), now).length, 1);
});

test("audit exceptions: moderate advisories never block", () => {
  assert.deepEqual(blockingAdvisories(audit("moderate"), [], now), []);
});

test("audit exceptions: shipped list expires within 30 days of its writing", async () => {
  const { AUDIT_EXCEPTIONS } = await import("../../scripts/audit-deps.mjs");
  for (const e of AUDIT_EXCEPTIONS) {
    assert.match(e.ghsa, /^GHSA-/);
    assert.ok(e.reason.length > 40, e.ghsa);
    assert.ok(new Date(e.expires) - new Date(e.added) <= 30 * 864e5, e.ghsa);
  }
});
