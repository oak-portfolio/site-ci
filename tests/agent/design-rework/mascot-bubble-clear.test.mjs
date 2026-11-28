// Ticket 92: Oak's speech bubble never sits on a link, button, field or text of the page under it.
import { ownServer } from "../support/own-server.mjs";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const noBrowser = existsSync(chromium.executablePath()) || process.env.CI ? false : "no Playwright browser on this runner; the UI suite on Depot runs this layout check";
const css = readFileSync(new URL("../../../src/styles/global.css", import.meta.url), "utf8");
const viewports = [{ width: 1280, height: 800 }, { width: 1280, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];

async function openHome(browser, viewport) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  await page.goto(`${galleryUrl}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const note = document.querySelector(".oak-mascot__message"), typed = note?.querySelector(".oak-mascot__message-text");
    return Boolean(typed?.textContent) && note.getAttribute("aria-label").endsWith(typed.textContent);
  }, null, { timeout: 20000 });
  return page;
}

function coveredByBubble() {
  const bubble = document.querySelector(".oak-mascot__bubble");
  if (!bubble) return { shown: false, hits: [] };
  const style = getComputedStyle(bubble), box = bubble.getBoundingClientRect();
  const shown = style.visibility !== "hidden" && Number(style.opacity) > 0.05;
  const hits = [...document.querySelectorAll("a, button, input, select, textarea, summary, p, li, h1, h2, h3, h4, h5, h6, figcaption")]
    .filter((element) => !element.closest(".oak-mascot"))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && getComputedStyle(element).visibility !== "hidden"
        && rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
    })
    .map((element) => `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") || element.textContent).trim().replace(/\s+/g, " ").slice(0, 40)}"`);
  return { shown, hits };
}

test("the visible bubble covers no link, button, field or text on the home at scroll 0 and at each of the first three sections", { skip: noBrowser }, async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      const page = await openHome(browser, viewport);
      const tops = await page.evaluate(() => [...document.querySelectorAll("main section")]
        .filter((section) => !section.parentElement.closest("main section")).slice(0, 3)
        .map((section) => section.getBoundingClientRect().top + window.scrollY));
      assert.equal(tops.length, 3, "the home has three sections to scroll to");
      for (const [index, top] of [0, ...tops].entries()) {
        await page.evaluate((y) => window.scrollTo(0, y), top);
        await page.waitForTimeout(400);
        const { shown, hits } = await page.evaluate(coveredByBubble);
        const where = `${viewport.width}x${viewport.height} ${index === 0 ? "scroll 0" : `section ${index}`}`;
        assert.ok(!shown || hits.length === 0, `${where}: the shown bubble covers ${hits.join(", ")}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("at 1280x800 the bubble still shows somewhere clear on the home", { skip: noBrowser }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await openHome(browser, { width: 1280, height: 800 });
    let clear = 0;
    for (let y = 0; y <= 1200 && clear === 0; y += 40) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(250);
      const { shown, hits } = await page.evaluate(coveredByBubble);
      if (shown && hits.length === 0) clear += 1;
    }
    assert.ok(clear > 0, "the bubble never shows clear of content between scroll 0 and 1200");
  } finally {
    await browser.close();
  }
});

test("a press on Say Hi at 1280x800 reaches the button, not the bubble", { skip: noBrowser }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await openHome(browser, { width: 1280, height: 800 });
    const target = await page.evaluate(() => {
      const button = [...document.querySelectorAll("main a, main button")].find((element) => /say hi/i.test(element.textContent));
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { reaches: button === hit || button.contains(hit), hit: hit?.className?.toString() ?? hit?.tagName };
    });
    assert.ok(target.reaches, `the press lands on ${target.hit}`);
  } finally {
    await browser.close();
  }
});

test("the bubble rules stay in global.css and the mascot's pointer-events rules are unchanged", () => {
  const rule = (selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`))?.[1] ?? "";
  assert.match(rule(".oak-mascot__bubble"), /border-radius: 999px/);
  assert.match(rule(".oak-mascot"), /pointer-events: none;/);
  assert.match(rule(".oak-mascot__body"), /pointer-events: auto;/);
});
