import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsx } from "./load-tsx.mjs";

const { createOakFunnel, oakFunnelTabId } = loadTsx("src/lib/oakFunnelClient.ts");
const turn = (id, state, answer) => ({ id, role: "assistant", state, answer });
const user = id => ({ id: `${id}:user`, role: "user", state: "complete" });

test("P07-G2 the funnel reports open, first question, answer, follow-up and contact once each per turn or tab", () => {
  const steps = [], funnel = createOakFunnel(step => steps.push(step));
  funnel.open(); funnel.open();
  funnel.observe([user("a"), turn("a", "pending")]);
  funnel.observe([user("a"), turn("a", "pending")]);
  funnel.observe([user("a"), turn("a", "complete", { kind: "sourced" })]);
  funnel.observe([user("a"), turn("a", "complete", { kind: "sourced" }), user("b"), turn("b", "pending")]);
  funnel.observe([user("a"), turn("a", "complete", { kind: "sourced" }), user("b"), turn("b", "complete", { kind: "sourced" })]);
  funnel.contact(); funnel.contact();
  assert.deepEqual(steps, ["open", "first-question", "answer", "follow-up", "answer", "contact"]);
});

test("P07-G2 a failed turn is a question with no answer, and a reopened saved conversation reports nothing", () => {
  const steps = [], funnel = createOakFunnel(step => steps.push(step));
  funnel.observe([user("old"), turn("old", "complete", { kind: "sourced" })]);
  assert.deepEqual(steps, []);
  funnel.observe([user("f"), turn("f", "pending")]);
  funnel.observe([user("f"), turn("f", "failed", null)]);
  assert.deepEqual(steps, ["first-question"]);
});

test("P07-G2 one random id per tab, kept for the tab and never per event", () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = oakFunnelTabId(storage);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(oakFunnelTabId(storage), first);
  assert.equal(oakFunnelTabId({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }), oakFunnelTabId({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }));
  assert.equal(readFileSync("src/lib/oakFunnelClient.ts", "utf8").includes("document.cookie"), false);
});

test("P07-G7 (retired in the v3 review) the answer footer has no report, thumbs or usage receipt", () => {
  // Oak, 2026-10-18: "we dont really need those". The footer keeps copy, copy with sources, ask again and open-in only.
  const turnSource = readFileSync("src/components/agent/OakTurn.tsx", "utf8");
  for (const gone of ['label="Report this answer"', "OakAnswerFeedback", "Answer usage confirmed"]) assert.equal(turnSource.includes(gone), false, gone);
  assert.ok(turnSource.includes('"Copy answer"') && turnSource.includes('"Copy with sources"'));
});
