import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const read = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};

test("D67-G1 panels with their own actions own the window, their nav bar stays put, and the brief ends in one primary", async () => {
  // The brief, model funding and documents carry their own actions: the message box steps aside (still mounted, inert).
  assert.match(read("src/components/agent/OakConversation.tsx"), /* R11 (intentional update) */ /standbySurface = \["brief", "funding", "documents", "voice", "conversation", "account"\]\.includes\(surface\)[\s\S]*standby=\{verifying \|\| \(!state\.pending && standbySurface\)\}/);
  assert.match(read("src/components/agent/OakComposer.tsx"), /data-standby=\{standby \|\| undefined\} inert=\{standby \|\| undefined\}/);
  const css = read("src/styles/oakAgent.css");
  assert.match(css, /\.oak-composer\[data-standby\] \{\n  display: none;/);
  // The nav bar pins like an iOS navigation bar, and frosts once content scrolls under it (D88).
  assert.match(css, /\.oak-workflow__heading\.oak-panel-nav \{[^}]*position: sticky;/);
  assert.match(css, /\.oak-workflow__heading\.oak-panel-nav\[data-scrolled\] \{[^}]*backdrop-filter: blur\(12px\)/);
  // The brief's message is its own raised group, and the email draft is the one primary, as a mailto link.
  const brief = read("src/components/agent/OakContactBriefEditor.tsx");
  // D116 re-tick: the message is a labelled well like the fields above it.
  // Q07 (intentional update): the prepared message is a proposal card section closed by a receipt, still one labelled well.
  assert.match(brief, /<section ref=\{proposal\} className="oak-brief__message oak-brief__proposal" aria-label="Prepared brief"><Field>/);
  // Ticket 23 :164 (intentional update): once the draft has opened, the link steps back to a secondary Open again.
  assert.match(brief, /<a className=\{buttonVariants\(\{ size: "sm", variant: opened \? "secondary" : "primary" \}\)\} href=\{oakBriefMailto\(draft\)\}/);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["contact-brief", "funding", "document-selected"]) {
      await open(page, state);
      assert.equal(await page.locator(".oak-composer").evaluate(node => getComputedStyle(node).display), "none", `${state}: the message box steps aside`);
    }
    // A panel without its own primary keeps the message box.
    await open(page, "answer-points");
    assert.notEqual(await page.locator(".oak-composer").evaluate(node => getComputedStyle(node).display), "none", "chat keeps the message box");
    // Scrolled, the documents nav bar stays at the top of the reading area.
    await open(page, "document-selected");
    const reading = page.locator(".oak-workspace__reading");
    await reading.evaluate(node => node.scrollTo(0, node.scrollHeight));
    await page.waitForTimeout(200);
    const offset = await page.evaluate(() => {
      const nav = document.querySelector(".oak-panel-nav").getBoundingClientRect(), area = document.querySelector(".oak-workspace__reading").getBoundingClientRect();
      return Math.round(nav.top - area.top);
    });
    assert.ok(Math.abs(offset) <= 24, `the nav bar stays at the top while scrolled (${offset} px)`);
    await open(page, "contact-brief");
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d67-brief-1440x900.png" });
  } finally {
    await browser.close();
  }
});
