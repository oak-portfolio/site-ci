import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { galleryUrl as siteUrl } from "./gallery.mjs";

// Q15 QA gate fix: the empty state's starters never swap sets under the pointer once shown.
const status = purpose => ({ configured: true, kind: "account", phase: "ready", role: "visitor", publishableKey: "pk_test_b2FrLWdhbGxlcnk", purpose,
  allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } });

async function shownSets(delayMs, body, ticks = 30) {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    // The visitor's status (with their purpose) answers after the panel has opened, as the live read does.
    await page.route("**/api/oak/auth/status*", async route => {
      await new Promise(done => setTimeout(done, delayMs));
      return body ? route.fulfill({ status: 200, contentType: "application/json", json: body }) : route.abort();
    });
    await page.goto(siteUrl, { waitUntil: "load" });
    await page.getByRole("button", { name: "Oak AI Agent" }).last().click();
    const seen = new Set();
    for (let tick = 0; tick < ticks; tick += 1) {
      const sample = await page.evaluate(() => {
        const box = document.querySelector(".oak-conversation__starters");
        if (!box || getComputedStyle(box).visibility === "hidden") return null;
        return [...box.querySelectorAll(".ui-suggestion__label")].map(label => label.textContent).join("|");
      });
      if (sample) seen.add(sample);
      await page.waitForTimeout(100);
    }
    return [...seen];
  } finally { await browser.close(); }
}

test("Q15 a visitor with a purpose sees only their own starters, never the mixed set first", async () => {
  const sets = await shownSets(900, status("exploring"));
  assert.equal(sets.length, 1, `one set shown: ${sets.join(" / ")}`);
  assert.match(sets[0], /What did Steve learn from his projects\?/, "the learner set");
});

test("Q15 a status read that fails still shows the mixed starters", async () => {
  const sets = await shownSets(200, null);
  assert.equal(sets.length, 1);
  assert.match(sets[0], /^What has Steve built\?/);
});

test("Q15 a slow status read shows the mixed starters after the hold instead of waiting forever", async () => {
  const sets = await shownSets(10000, status("exploring"));
  assert.equal(sets.length, 1, `one set shown within 3 s: ${sets.join(" / ")}`);
  assert.match(sets[0], /^What has Steve built\?/);
});

test("Q15 a status that lands after the hold never swaps the starters already on screen", async () => {
  // R4 review: 2 s lands after the 1.5 s hold; watch 4 s so the late reply is inside the window.
  const sets = await shownSets(2000, status("exploring"), 40);
  assert.equal(sets.length, 1, `one set shown: ${sets.join(" / ")}`);
  assert.match(sets[0], /^What has Steve built\?/);
});
