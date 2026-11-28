import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { loadTsx } from "../design-rework/load-tsx.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, addEventListener() {}, removeEventListener() {} };
const { OakChainOfThought, OAK_SLOW_STEP_MS } = loadTsx("src/components/agent/OakChainOfThought.tsx");

const css = postcss.parse(readFileSync("src/styles/oakAgent.css", "utf8"));
const warm = /--oak-gold|--oak-tint-gold|--danger/;
/** Every declaration on rules that style the given class, so a tone can be read from the stylesheet. */
const declarationsFor = (className) => {
  const found = [];
  css.walkRules(rule => { if (rule.selector.split(",").some(part => part.includes(className))) rule.walkDecls(decl => found.push(`${rule.selector} { ${decl.prop}: ${decl.value} }`)); });
  return found;
};
const message = (fields) => ({ id: "a1", role: "assistant", text: "", answer: null, cards: [], usage: null, page: "/", ...fields });
const trail = (fields) => renderToStaticMarkup(createElement(OakChainOfThought, { question: "q", progress: "Weighing what I found", message: message(fields) }));

test("Q02-G4 the elapsed-time pill and a named wait are neutral gray, never gold", () => {
  const now = Date.now();
  const html = trail({ state: "pending", steps: [{ id: "weigh-1", operation: "weigh", state: "running", startedAt: now - OAK_SLOW_STEP_MS - 600 }] });
  assert.match(html, /class="oak-cot__clock"/, "the live clock pill shows");
  assert.match(html, /class="oak-cot__detail oak-cot__detail--slow"/, "the named wait shows");
  for (const name of ["oak-cot__clock", "oak-cot__detail--slow", "oak-cot__wait-stop"]) {
    const rules = declarationsFor(name);
    assert.ok(rules.length > 0, `${name} is styled`);
    assert.deepEqual(rules.filter(rule => warm.test(rule)), [], `${name} stays neutral`);
  }
});

test("Q02-G4 a survivable downgrade (research unavailable) is a neutral note; red stays for a failed turn", () => {
  const now = Date.now();
  const steps = [{ id: "understand", operation: "understand", state: "done", startedAt: now - 4000, endedAt: now - 3500 },
    { id: "research", operation: "research", state: "error", startedAt: now - 3500, endedAt: now - 1000 }];
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: [],
    kind: "sourced", acknowledgment: null, claims: [] };
  const settled = trail({ state: "complete", answer, steps });
  assert.match(settled, /oak-cot__count oak-cot__count--note/, "the header names the downgrade as a note");
  assert.doesNotMatch(settled, /--warn|--danger/);
  const live = trail({ state: "pending", steps });
  assert.match(live, /class="oak-cot__detail oak-cot__detail--note">Current public research is unavailable/, "the row says it as a note");
  assert.doesNotMatch(live, /oak-cot__detail--error/);
  for (const name of ["oak-cot__count--note", "oak-cot__detail--note"]) {
    const rules = declarationsFor(name);
    assert.ok(rules.length > 0, `${name} is styled`);
    assert.deepEqual(rules.filter(rule => warm.test(rule)), [], `${name} stays neutral`);
  }
  const researchNode = declarationsFor('[data-state="error"][data-kind="research"]');
  assert.ok(researchNode.length > 0 && researchNode.every(rule => !warm.test(rule)), "the research row's node is neutral");
  // A stopped turn's failed step keeps the red that means the turn itself failed.
  assert.ok(declarationsFor("oak-cot__detail--error").some(rule => /--danger/.test(rule)));
});
