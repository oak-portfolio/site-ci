import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 53 (gallery on OAK_GALLERY_URL): each preset control changes the drawing, and each change is heard once through the transcript region.
let browser;
before(async () => { browser = await chromium.launch(); });
after(() => browser?.close());

const open = async id => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await openState(page, id, { settle: 600 });
  await page.evaluate(() => {
    window.__heard = [];
    const region = document.querySelector(".sr-only[role=status][aria-live=polite]");
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => node.textContent && window.__heard.push(node.textContent))))
      .observe(region, { childList: true, subtree: true, characterData: true });
  });
  return page;
};
const heard = async (page, pattern) => { await page.waitForTimeout(300); return (await page.evaluate(() => window.__heard)).filter(text => pattern.test(text)); };
const step = async (page, slider) => {
  await slider.focus();
  const before = await slider.getAttribute("aria-valuetext");
  await page.keyboard.press("ArrowRight");
  const after = await slider.getAttribute("aria-valuetext");
  return { before, after };
};
const spoken = async (page, pattern, { before, after }) => [...await heard(page, pattern), ...(after !== before && pattern.test(after) ? [after] : [])];

test("xemb: an arrow key moves the native slider one step, the value text follows, and the change is heard once across live region and valuetext", async () => {
  const page = await open("explainer-xemb");
  const slider = page.getByRole("slider", { name: "Neighbours" });
  const moved = await step(page, slider);
  assert.equal(await slider.inputValue(), "4");
  assert.equal(await page.locator(".oak-explainer__slider output").innerText(), "4");
  assert.equal(await page.locator(".oak-explainer__point[data-near]").count(), 4);
  assert.deepEqual(await spoken(page, /nearest to puppy/, moved), ["4 nearest to puppy: dog, kitten, cat, leash."]);
});

test("xrag: a top-k chip keeps that many passages and is heard once", async () => {
  const page = await open("explainer-xrag");
  await page.getByRole("button", { name: "Top 5", exact: true }).click();
  assert.equal(await page.locator(".oak-explainer__passages [data-kept]").count(), 5);
  assert.deepEqual(await heard(page, /^Top/), ["Top 5: the model reads 5 passages, 1 left out."]);
});

test("xgrad: an arrow key moves the learning-rate slider one fixture rate, the value text follows, and the change is heard once across live region and valuetext", async () => {
  const page = await open("explainer-xgrad");
  const slider = page.getByRole("slider", { name: "Learning rate" });
  const moved = await step(page, slider);
  assert.equal(await slider.inputValue(), "2");
  assert.equal(await page.locator(".oak-explainer__slider output").innerText(), "0.5");
  assert.deepEqual(await spoken(page, /^Learning rate/, moved), ["Learning rate 0.5: after 6 steps the loss is 0.00, down from 16.00. Just right for this curve: one step lands on the bottom."]);
});

test("xeval: a round chip redraws the pass rates and is heard once", async () => {
  const page = await open("explainer-xeval");
  await page.getByRole("button", { name: "Round 3", exact: true }).click();
  assert.equal(await page.locator(".oak-explainer__checks [data-clears]").count(), 3);
  assert.deepEqual(await heard(page, /^Round/), ["Round 3: 3 of 3 checks clear 90%. Questions with no answer now get a plain I don't know."]);
});

for (const [id, noun, second] of [["explainer-xtool", "step", "Step 2 of 4, Call"], ["explainer-statediag", "state", "State 2 of 4, Listening"], ["explainer-xoffsteps", "step", "Step 2 of 4, Water"]]) {
  test(`${id}: next moves one ${noun}, nothing plays by itself, and the change is heard once`, async () => {
    const page = await open(id);
    await page.waitForTimeout(1200);
    assert.deepEqual(await heard(page, /of 4/), [], "nothing advances without the visitor");
    if (id === "explainer-statediag") assert.equal(await page.locator(".oak-explainer__xstate .oak-explainer__state").count(), 4, "the dagre layout drew");
    await page.getByRole("button", { name: `Next ${noun}`, exact: true }).click();
    const said = await heard(page, /of 4/);
    assert.equal(said.length, 1);
    assert.ok(said[0].startsWith(second), said[0]);
  });
}
