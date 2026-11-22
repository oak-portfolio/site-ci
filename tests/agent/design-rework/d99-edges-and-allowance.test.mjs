import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
};

test("D99-G1 when a card mounts under the transcript, a reader at the newest message keeps it in view", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["sign-in", "sign-in-unavailable"]) {
      await open(page, state);
      await page.locator("section.oak-account-intake").waitFor();
      await page.waitForTimeout(1200);
      const edge = await page.evaluate(() => {
        const viewport = document.querySelector(".oak-conversation__viewport"), last = [...viewport.querySelectorAll("[data-message-id]")].at(-1);
        return { lastBottom: Math.round(last.getBoundingClientRect().bottom), viewBottom: Math.round(viewport.getBoundingClientRect().bottom),
          below: Math.round(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight) };
      });
      assert.ok(edge.below <= 24, `${state}: the transcript stays at its end (${edge.below}px below)`);
      assert.ok(edge.lastBottom <= edge.viewBottom + 1, `${state}: the newest message is whole in view (${edge.lastBottom} vs ${edge.viewBottom})`);
    }
  } finally {
    await browser.close();
  }
});

test("D99-G2 the funding panel shows the sponsored answers left as an inset group: the count, a bar, one footnote", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "funding");
    const group = page.locator(".oak-funding__allowance");
    await group.waitFor();
    const shape = await group.evaluate(node => {
      const body = node.querySelector(".oak-group__body"), meter = body.querySelector('[role="meter"]'), count = body.querySelector(".oak-usage-card__count");
      const inner = body.getBoundingClientRect(), text = count.getBoundingClientRect();
      return { header: node.querySelector(".oak-group__header").textContent, count: count.textContent.replace(/\s+/g, " ").trim(),
        value: meter?.getAttribute("aria-valuenow"), max: meter?.getAttribute("aria-valuemax"), label: meter?.getAttribute("aria-label"),
        inset: Math.round(text.left - inner.left), footnote: node.querySelectorAll(":scope > .oak-group__footnote").length };
    });
    assert.equal(shape.header, "Answers left");
    assert.match(shape.count, /^4\s*of 6 answers left$/); // ADR 0002: one refilling allowance
    assert.equal(shape.value, "4");
    assert.equal(shape.max, "6");
    assert.match(shape.label, /4 of 6 answers left/, "the bar is named with the exact counts");
    assert.ok(shape.inset >= 12, `the count sits inside the group's padding (${shape.inset}px)`);
    // Q09 (intentional update): the refill rule is the panel's one line; a footnote appears only for grant-code answers.
    assert.equal(shape.footnote, 0);
  } finally {
    await browser.close();
  }
});
