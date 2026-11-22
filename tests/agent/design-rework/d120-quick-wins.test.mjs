import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// D120: Oak's quick fixes from his wave 9 browser comments.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const ready = page => page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.waitForTimeout(400);
};
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
const withPage = async (run, options = {}) => {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options })).newPage()); } finally { await browser.close(); }
};

test("D120-G1 follow-up suggestions never repeat themselves", () => {
  const { oakAnswerSuggestions } = loadTsx("src/lib/oakSuggestions.ts");
  const message = { role: "assistant", state: "complete", cards: [], answer: { kind: "sourced", knowledgeRevision: "r", points: [] } };
  const suggestions = oakAnswerSuggestions(message, "What tradeoffs did Steve make?");
  assert.equal(new Set(suggestions).size, suggestions.length, `no repeats: ${JSON.stringify(suggestions)}`);
});

test("D120-G2 an error under the transcript never sits under the floating follow-ups", () => withPage(async page => {
  await open(page, "answer-points");
  await store(page, workspace => workspace.setOakWorkspaceFixture({ error: "Connect your own OpenRouter account to keep going, or come back when Oak's allowance refills." }));
  await page.waitForTimeout(600);
  const rects = await page.evaluate(() => {
    const rect = node => { if (!node || !node.checkVisibility()) return null; const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    return { status: rect(document.querySelector(".oak-workspace__status")), chips: rect(document.querySelector(".oak-composer__suggestions")) };
  });
  assert.ok(rects.status, "the error shows");
  const overlap = rects.chips && rects.chips.top < rects.status.bottom && rects.chips.bottom > rects.status.top && rects.chips.left < rects.status.right && rects.chips.right > rects.status.left;
  assert.ok(!overlap, `the follow-ups step aside for the error (${JSON.stringify(rects)})`);
}));

test("D120-G3 the role description counts characters, not bytes", () => withPage(async page => {
  await open(page, "role-fit");
  const counter = (await page.locator("#oak-role-limit").textContent()).trim();
  assert.match(counter, /^[\d,]+ \/ 4,000 characters$/, `a human counter (${counter})`);
}));

test("D120-G4 the role description can be pasted from the clipboard or filled from a sample", () => withPage(async page => {
  await open(page, "role-fit");
  const field = page.locator("#oak-role-description");
  await field.fill("");
  await page.getByRole("button", { name: "Try a sample role" }).click();
  const sample = await field.inputValue();
  assert.ok(sample.length > 200, `the sample is a real job post (${sample.length} characters)`);
  assert.equal(await field.evaluate(node => node === document.activeElement), true, "and the field takes focus for editing");
  await page.evaluate(() => navigator.clipboard.writeText("Senior Design Engineer. You will own the design system and ship AI features end to end."));
  await field.fill("");
  await page.getByRole("button", { name: "Paste job post" }).click();
  await page.waitForTimeout(200);
  assert.equal(await field.inputValue(), "Senior Design Engineer. You will own the design system and ship AI features end to end.");
}, { permissions: ["clipboard-read", "clipboard-write"] }));
