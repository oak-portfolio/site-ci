import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D100-G1 the reasoning trail's found sources render through the one citations component, numbered like the answer's own", async () => {
  // Source: the trail has no list of its own; research sources live once, on the research card.
  const chain = readFileSync(new URL("../../../src/components/agent/OakChainOfThought.tsx", import.meta.url), "utf8");
  assert.match(chain, /<OakCitations citations=\{sources\}/, "found sources go through OakCitations");
  assert.doesNotMatch(chain, /<ul|oak-cot__chip|ResearchSources/, "no trail-only source list remains");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    await page.locator(".ui-chain-of-thought__header").first().click();
    await page.locator('.oak-cot__step[data-kind="search"] .oak-message__source').first().waitFor({ timeout: 3000 });
    const lists = await page.evaluate(() => {
      const read = scope => [...scope.querySelectorAll(".oak-message__source")].map(pill => `${pill.dataset.sourceNumber} ${pill.querySelector(".oak-message__source-title").textContent}`);
      const trail = document.querySelector('.oak-cot__step[data-kind="search"]');
      return { trail: read(trail), label: trail.querySelector(".oak-message__sources").getAttribute("aria-label") };
    });
    // D122: the answer numbers its sources only in its Sources panel (chips carry no numbers), so compare against that.
    await page.locator(".oak-turn__answer .oak-answer__sources-button").click();
    await page.locator(".oak-sources-panel .oak-source-row").first().waitFor({ timeout: 3000 });
    lists.answer = await page.locator(".oak-sources-panel .oak-source-row").evaluateAll(rows => rows.map(row =>
      `${row.querySelector(".oak-source-row__number").textContent} ${row.querySelector(".oak-source-row__title").textContent}`));
    assert.equal(lists.label, "Sources found");
    assert.ok(lists.trail.length >= 2, `the trail names the sources it found (${lists.trail})`);
    assert.deepEqual([...lists.trail].sort(), [...lists.answer].sort(), "same numbers and titles as the answer's Sources panel");
  } finally {
    await browser.close();
  }
});
