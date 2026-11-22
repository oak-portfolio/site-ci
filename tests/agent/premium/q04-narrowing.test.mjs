import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "./gallery.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, addEventListener() {}, removeEventListener() {} };
const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");

const clarify = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: ["search"],
  kind: "clarify", question: "Steve built a few agent projects. Which one should I focus on?",
  options: ["Agentic Brain, agent memory", "Oakminder, a productivity agent", "This Oak AI Agent"] };
const render = (latest) => renderToStaticMarkup(createElement(OakTurn, { latest, question: "What did Steve build for AI agents?", progress: "",
  contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {},
  message: { id: "a1", role: "assistant", text: "", answer: clarify, cards: [], usage: null, state: "complete", page: "/" } }));
const open = async (page) => {
  await openState(page, "answer-narrowing");
};
const asked = (page, text) => page.waitForFunction(words => [...document.querySelectorAll(".ui-message[data-align='end'] .ui-bubble")]
  .some(bubble => bubble.textContent.trim() === words), text, { timeout: 8000 });

test("Q04-G2 a narrowing answer renders its options as pills under Oak's question, active only on the newest turn", () => {
  const html = render(true);
  assert.match(html, /class="oak-narrow__question">Steve built a few agent projects\. Which one should I focus on\?</);
  assert.match(html, /role="group" aria-label="Steve built a few agent projects\. Which one should I focus on\?"/);
  for (const option of clarify.options) assert.match(html, new RegExp(`<button[^>]*class="ui-suggestion"[^>]*>[\\s\\S]*?${option}`));
  assert.match(html, /Pick one, or type your own\./, "the message box still takes the visitor's own words");
  assert.doesNotMatch(html, /aria-label="Copy answer"/, "nothing to copy on a narrowing question");
  const older = render(false);
  assert.equal(older.match(/<button[^>]*disabled=""/g)?.length, clarify.options.length, "an older turn's pills cannot ask again");
  assert.doesNotMatch(older, /Pick one, or type your own/);
});

test("Q04-G2 a tapped pill is sent as the visitor's next question, and typing still works", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page);
    const pills = page.locator(".oak-narrow__options .ui-suggestion");
    assert.equal(await pills.count(), 3);
    await pills.nth(1).click();
    await asked(page, "Oakminder, a productivity agent");
    await open(page);
    await page.locator("#oak-composer-input").fill("Tell me about Agentic Brain");
    await page.keyboard.press("Enter");
    await asked(page, "Tell me about Agentic Brain");
  } finally { await browser.close(); }
});
