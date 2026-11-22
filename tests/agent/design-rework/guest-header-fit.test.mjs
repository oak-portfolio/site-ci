import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 128: a guest's chat header keeps the whole title on a phone.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

const open = async (browser, width) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(`${galleryUrl}/__dev/oak-states?state=empty`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 40000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  return page;
};

test("G128-1 a guest header shows the whole title with 44px buttons at 360, 390 and 430", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [360, 390, 430]) {
      const page = await open(browser, width);
      const title = page.locator(".oak-workspace__heading h2").first();
      assert.equal((await title.innerText()).trim(), "Oak AI Agent");
      const fit = await title.evaluate(node => [node.scrollWidth, node.clientWidth]);
      assert.ok(fit[0] <= fit[1], `${width}: the title is not clipped (scroll ${fit[0]} vs client ${fit[1]})`);
      const small = await page.locator(".oak-workspace__header button:visible").evaluateAll(nodes =>
        nodes.map(node => { const box = node.getBoundingClientRect(); return { name: node.getAttribute("aria-label") ?? node.textContent, w: box.width, h: box.height }; })
          .filter(box => box.w < 43.5 || box.h < 43.5));
      assert.deepEqual(small, [], `${width}: every header button is at least 44px`);
      const trigger = page.locator("[data-oak-account-trigger]");
      assert.match(await trigger.getAttribute("aria-label"), /^Sign in/);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("G128-2 at 1280 the guest keeps the visible Sign in label", async () => {
  const browser = await chromium.launch();
  try {
    const page = await open(browser, 1280);
    assert.equal((await page.locator(".oak-account-trigger__label").innerText()).trim(), "Sign in");
    await page.close();
  } finally { await browser.close(); }
});

// r128 P2: the face-only guest trigger keeps R17's equal ink-to-ink gaps on a phone.
test("G128-3 a guest's top-right controls sit an equal visible gap apart at 360, 390 and 430", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [360, 390, 430]) {
      const page = await open(browser, width);
      const gaps = await page.evaluate(() => {
        const actions = document.querySelector(".oak-workspace__header-actions");
        const controls = [...actions.querySelectorAll("button, a")].filter(node => node.getBoundingClientRect().width);
        const ink = node => {
          const range = document.createRange(); range.selectNodeContents(node);
          const rects = [...node.querySelectorAll("svg, img, span"), range].flatMap(item => [...item.getClientRects()]).filter(rect => rect.width && rect.height);
          return { left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.right)) };
        };
        const inks = controls.map(ink);
        return inks.slice(1).map((value, index) => Math.round(value.left - inks[index].right));
      });
      assert.ok(gaps.length >= 3, `${width}: ${gaps.length + 1} controls`);
      assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 2, `${width}: visible gaps ${gaps.join("/")} differ by more than 2px`);
      await page.close();
    }
  } finally { await browser.close(); }
});
