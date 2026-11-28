import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "./gallery.mjs";

// R22 live reading (2026-10-23, captures live-v20): what the gallery fixtures never showed.
const { oakIsScopeDecline } = loadTsx("src/lib/oakSuggestions.ts");
const { settleOakToolSteps } = loadTsx("src/lib/oakToolSteps.ts");
const decline = "I only cover Steve Oak\u2019s work, so I can\u2019t help with that one. Ask me about his projects, roles or writing.";

test("R22 live: an off-topic decline is a scope decline, a real evidence gap is not", () => {
  assert.equal(oakIsScopeDecline({ kind: "gap", acknowledgment: decline, claims: [] }), true);
  assert.equal(oakIsScopeDecline({ kind: "gap", acknowledgment: "The parts of Steve's profile I read don't mention his favorite food.", claims: [] }), false);
  assert.equal(oakIsScopeDecline({ kind: "gap", acknowledgment: decline, claims: [{ id: "claim-1" }] }), false, "a gap with claims still has evidence to show");
  assert.equal(oakIsScopeDecline({ kind: "sourced", acknowledgment: null, claims: [] }), false);
  // R27 live (12:28Z): the decline names its own verb after "so I can't".
  for (const note of ["I only cover Steve's work and projects, so I can't provide a recipe for banana bread.", "I only answer questions about his work, so I won't write a poem."])
    assert.equal(oakIsScopeDecline({ kind: "gap", acknowledgment: note, claims: [] }), true, note);
  for (const note of ["I only cover Steve's work, so I can't say what his salary is.", "I only cover his projects, so I can't confirm a start date."])
    assert.equal(oakIsScopeDecline({ kind: "gap", acknowledgment: note, claims: [] }), false, note);
  // R23 review M2: real gaps the shared check alone would pass keep their evidence-gap label.
  for (const note of ["I only read his projects, and they don't mention Rust.", "I can't say what his salary is; I only cover Steve's work."])
    assert.equal(oakIsScopeDecline({ kind: "gap", acknowledgment: note, claims: [] }), false, note);
});

test("R23 review: a role clause keeps a leading dot (.NET) and drops a leading separator", () => {
  const { requirementClause } = loadTsx("src/lib/oakQuote.ts");
  assert.equal(requirementClause(".NET Core services in production", 0, 0), ".NET Core services in production");
  assert.equal(requirementClause("; React, CSS and motion", 0, 0), "React, CSS and motion");
});

test("R22 live: a guardrail stop keeps only the steps that finished; any other failure still marks the cut step", () => {
  const steps = [{ id: "u", operation: "understand", state: "done", startedAt: 0, endedAt: 1 }, { id: "t", operation: "think", state: "running", startedAt: 1 }];
  assert.deepEqual(settleOakToolSteps(steps, "blocked", 5).map(step => `${step.operation}:${step.state}`), ["understand:done"]);
  assert.deepEqual(settleOakToolSteps(steps, "failed", 5).map(step => `${step.operation}:${step.state}`), ["understand:done", "think:error"]);
});

test("R22 live: the injection stop and the off-topic decline read calmly in the gallery", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openState(page, "injection-blocked", { settle: 300 });
    const blocked = await page.evaluate(() => ({ text: document.body.textContent ?? "", errors: document.querySelectorAll(".oak-cot__detail--error").length }));
    assert.equal(blocked.errors, 0, "no red stopped step for a guardrail stop");
    assert.doesNotMatch(blocked.text, /steps? stopped/, "the header does not count a stopped step");
    assert.match(blocked.text, /Stopped before answering/);
    await openState(page, "answer-off-topic", { settle: 300 });
    const offTopic = await page.evaluate(() => document.body.textContent ?? "");
    assert.match(offTopic, /Outside Steve's work/);
    assert.doesNotMatch(offTopic, /Evidence gap|fill that evidence gap/);
  } finally { await browser.close(); }
});
