import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 154 (gallery on OAK_GALLERY_URL): at 390 each listed control owns a 44px target around its centre. Hit testing
// follows border-radius, so the diagonal probes sit on the 44px circle a round control draws.
const CONTROLS = [
  ["contact-card-hiring", ".oak-contact-card .oak-contact-card__decline"],
  ["contact-card-focus", ".oak-contact-focus .oak-contact-card__decline"],
  ["screens-six", ".oak-screens__thumb"],
  ["screens-off-ratio", ".oak-screens__thumb"],
  ["quote-carousel", ".oak-quote__dot"],
];

const misses = (page, selector) => page.evaluate(sel => {
  const out = [];
  [...document.querySelectorAll(sel)].forEach((node, index) => {
    node.scrollIntoView({ block: "center", inline: "center" });
    const box = node.getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    for (const [dx, dy] of [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21], [-15, -15], [15, 15], [-15, 15], [15, -15]]) {
      if (!node.contains(document.elementFromPoint(x + dx, y + dy))) out.push(`#${index} ${Math.round(box.width)}x${Math.round(box.height)} misses (${dx},${dy})`);
    }
  });
  return out;
}, selector);

test("gallery: at 390 the contact card's Not now and Close, the Screens thumbnails and the Quote dots each own a 44x44 tap area", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const found = [];
    for (const [id, selector] of CONTROLS) {
      await openState(page, id, { settle: 600 });
      assert.ok(await page.locator(selector).count() > 0, `${id}: ${selector} is drawn`);
      found.push(...(await misses(page, selector)).map(line => `${id} ${selector} ${line}`));
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(scrollWidth <= clientWidth, `${id}: no sideways scroll at 390 (${scrollWidth} > ${clientWidth})`);
    }
    assert.deepEqual(found, []);
  } finally { await browser.close(); }
});

// The focus ring (2px at outline-offset 2px) must stay inside the strip's clip box.
const ringClipped = (page, selector) => page.locator(selector).evaluate(node => {
  const strip = node.closest(".oak-screens__strip").getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const ring = 4;
  return box.left - ring < strip.left - 0.5 || box.right + ring > strip.right + 0.5 || box.top - ring < strip.top - 0.5 || box.bottom + ring > strip.bottom + 0.5
    ? `${node.getAttribute("aria-label")} [${Math.round(box.left)},${Math.round(box.right)}] outside strip [${Math.round(strip.left)},${Math.round(strip.right)}]` : null;
});

test("gallery: at 390 the Screens strip follows the current shot and the focused thumbnail, rings unclipped", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
    await openState(page, "screens-six", { settle: 600 });
    const total = await page.locator(".oak-screens__thumb").count();
    for (let step = 1; step < total; step++) await page.getByRole("button", { name: "Next screen" }).click();
    await page.waitForTimeout(400);
    assert.match(await page.locator(".oak-screens__count").textContent(), new RegExp(`${total} of ${total}`));
    const off = [await ringClipped(page, '.oak-screens__thumb[aria-current="true"]')];
    await openState(page, "screens-six", { settle: 600 });
    await page.getByRole("button", { name: "Next screen" }).focus();
    for (let index = 0; index < total; index++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.activeElement?.className), "oak-screens__thumb");
      off.push(await ringClipped(page, ".oak-screens__thumb:focus"));
    }
    assert.deepEqual(off.filter(Boolean), []);
  } finally { await browser.close(); }
});

test("gallery: at 1280 the quote dots, the contact card's Not now and the screens thumbnails keep their desktop size", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "quote-carousel", { settle: 300 });
    assert.deepEqual(await page.locator(".oak-quote__dot").first().evaluate(node => [node.offsetWidth, node.offsetHeight]), [24, 24]);
    await openState(page, "contact-card-hiring", { settle: 300 });
    assert.deepEqual(await page.locator(".oak-contact-card__decline").first().evaluate(node => [node.offsetWidth, node.offsetHeight]), [32, 32]);
    await openState(page, "screens-six", { settle: 300 });
    assert.deepEqual(await page.locator(".oak-screens__thumb").first().evaluate(node => [node.offsetWidth, node.offsetHeight]), [106, 48]);
  } finally { await browser.close(); }
});
