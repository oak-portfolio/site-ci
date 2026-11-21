import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 153 (gallery on OAK_GALLERY_URL): blocks are heard only through the transcript's one polite region, and only when the visitor moves.
let browser;
before(async () => { browser = await chromium.launch(); });
after(() => browser?.close());

const open = async (id, settle = 600) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await openState(page, id, { settle });
  assert.equal(await page.locator(".oak-openui [aria-live], .oak-openui [role=status]").count(), 0, `${id}: no block keeps a live region of its own`);
  await page.evaluate(() => {
    window.__heard = [];
    const region = document.querySelector(".sr-only[role=status][aria-live=polite]");
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => node.textContent && window.__heard.push(node.textContent))))
      .observe(region, { childList: true, subtree: true, characterData: true });
  });
  return page;
};
const heard = page => page.evaluate(() => window.__heard);
const press = async (page, name) => { await page.getByRole("button", { name, exact: true }).first().click(); await page.waitForTimeout(300); };

test("gallery: Quote says its page through the transcript region on a page change, and nothing on mount or while streaming", async () => {
  const page = await open("quote-carousel");
  assert.doesNotMatch(await page.locator(".sr-only[role=status]").innerText(), /Quote/, "mount is quiet");
  await press(page, "Next quote");
  assert.deepEqual((await heard(page)).filter(text => /Quote/.test(text)), ["Quote 2 of 3."]);
  const streaming = await open("quote-streaming", 0);
  await streaming.waitForTimeout(1500);
  assert.deepEqual((await heard(streaming)).filter(text => /Quote/.test(text)), [], "streaming slides are not announced");
  assert.doesNotMatch(await streaming.locator(".sr-only[role=status]").innerText(), /Quote/);
});

test("gallery: Diagram says the selected step through the transcript region when the step changes", async () => {
  const page = await open("diagram-flow-agentic-brain");
  assert.deepEqual(await heard(page), []);
  await press(page, "Next step");
  const title = await page.locator(".oak-diagram__panel-title").first().innerText();
  const said = await heard(page);
  assert.equal(said.length, 1);
  assert.match(said[0], new RegExp(`^Step 2 of \\d+\\. ${title}\\. `));
});

test("gallery: an Explainer step revisited is heard again", async () => {
  const page = await open("explainer-concept-rag");
  await press(page, "Next step");
  await press(page, "Previous step");
  await press(page, "Next step");
  const said = (await heard(page)).filter(text => /^Step \d of \d/.test(text));
  assert.equal(said.length, 3);
  assert.match(said[0], /^Step 2 of /);
  assert.match(said[1], /^Step 1 of /);
  assert.equal(said[2], said[0], "step 2 is said again on the second visit");
});
