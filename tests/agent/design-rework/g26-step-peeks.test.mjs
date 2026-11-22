import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 26a: under a finished search, read or web step, "What I read" lists what that step read. Only with oakStepPeeks on.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

async function open(browser, id, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  const page = await context.newPage();
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForSelector(".oak-cot__steps", { timeout: 10000 });
  await page.waitForTimeout(1200);
  return page;
}
const withBrowser = async run => { const browser = await chromium.launch(); try { await run(browser); } finally { await browser.close(); } };
const rowsOf = (page, kind) => page.locator(`.oak-cot__step[data-kind="${kind}"] .oak-cot__peek-link`).evaluateAll(links =>
  links.map(link => ({ title: link.querySelector(".oak-cot__peek-title").textContent, meta: link.querySelector(".oak-cot__peek-meta").textContent, href: link.getAttribute("href") })));

test("G26-G1 a search lists its 3 passages, a read its 1, and the web step its page with the site and the day it was fetched", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "step-peeks-open");
    const search = await rowsOf(page, "search");
    assert.deepEqual(search.map(row => `${row.title} / ${row.meta}`), ["EcoSmartLoop / The decision loop", "Oakminder / Voice Became The Action Layer", "LinkedIn Growth Loop / The First Daily Loop"]);
    assert.equal(search[0].href, "https://steveoak.com/work/ecosmartloop/#the-decision-loop", "each passage links to its section");
    assert.deepEqual((await rowsOf(page, "read")).map(row => row.title), ["Oakminder"]);
    const [web] = await rowsOf(page, "research");
    assert.equal(web.title, "Limits · Cloudflare Workers docs");
    assert.match(web.meta, /^developers\.cloudflare\.com, fetched [A-Z][a-z]{2} \d{1,2}$/);
    assert.match(await page.locator('.oak-cot__step[data-kind="research"] .oak-cot__peek-link').first().innerText(), /\(new tab\)$/, "a web peek says it opens a new tab");
    assert.doesNotMatch(await page.locator('.oak-cot__step[data-kind="search"] .oak-cot__peek-link').first().innerText(), /new tab/, "a site passage opens in place");
    const text = await page.locator(".oak-cot__steps").innerText();
    assert.doesNotMatch(text, /Searched for|How does Steve approach AI systems\?/, "never the visitor's words or a tool query on the trail");
    assert.equal(await page.locator(".oak-cot__peek-more").count(), 0);
  });
});

test("G26-G2 seven passages show five, then \"2 more\"", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "step-peeks-seven");
    assert.equal((await rowsOf(page, "search")).length, 5);
    assert.equal(await page.locator(".oak-cot__peek-more").innerText(), "2 more");
  });
});

test("G26-G3 closed, the list is hidden and out of the tab order; the toggle names its state and opens it", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "step-peeks-closed");
    const toggle = page.locator('.oak-cot__step[data-kind="search"] .oak-cot__peek-toggle');
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator(".oak-cot__peek-link").evaluateAll(links => links.filter(link => link.offsetParent !== null).length), 0, "no passage link is rendered while closed");
    await toggle.focus();
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => !document.activeElement?.classList.contains("oak-cot__peek-link")), "Tab skips the closed list");
    await toggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true", "Enter opens it");
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement?.classList.contains("oak-cot__peek-link")), "Tab then reaches the first passage");
    await toggle.focus();
    await page.keyboard.press("Space");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Space closes it");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    const list = await toggle.getAttribute("aria-controls");
    assert.equal(await page.locator(`[id="${list}"] .oak-cot__peek-link`).count(), 3);
  });
});

test("G26-G4 with the constant off the trail is unchanged: no \"What I read\" anywhere", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "step-peeks-off");
    assert.equal(await page.locator(".oak-cot__peek").count(), 0);
    assert.equal(await page.locator('.oak-cot__step[data-kind="search"] .oak-cot__tally').innerText(), "3 passages", "the count from main stays");
  });
});

test("G26-G5 at 390, under reduced motion and forced colors, every passage row stays inside the trail", async () => {
  await withBrowser(async browser => {
    for (const options of [{ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }, { viewport: { width: 390, height: 844 }, forcedColors: "active" }]) {
      const page = await open(browser, "step-peeks-open", options);
      const overflow = await page.locator(".oak-cot__peek-link").evaluateAll(links => links.filter(link => {
        const box = link.getBoundingClientRect(), rail = link.closest(".oak-cot__steps").getBoundingClientRect();
        return box.left < rail.left - 1 || box.right > rail.right + 1;
      }).length);
      assert.equal(overflow, 0, JSON.stringify(options));
      const cut = await page.locator(".oak-cot__peek-title").evaluateAll(titles =>
        titles.filter(title => title.textContent === "Oakminder" && title.scrollWidth > title.clientWidth).length);
      assert.equal(cut, 0, `a short title stays whole ${JSON.stringify(options)}`);
    }
  });
});
