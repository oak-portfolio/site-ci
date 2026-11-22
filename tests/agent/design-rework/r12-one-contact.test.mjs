import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

// R12 live (2026-10-20): a handoff answer arrives with the Worker's contact card too. Seen on steveoak.com as a bare second
// "Contact Steve" card under the handoff card; the turn now offers one way to write to Steve.
test("Q24-G16 R12 a handoff answer shows exactly one Contact Steve in its turn", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=contact-handoff`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const turn = page.locator(".oak-turn__answer").last();
    assert.equal(await turn.locator(".oak-turn__handoff").count(), 1, "the handoff card is there");
    assert.equal(await turn.getByRole("button", { name: "Contact Steve" }).count(), 1, "one Contact Steve per turn");
    assert.equal(await turn.locator(".oak-message__card").count(), 0, "no bare contact card under the handoff");
  } finally { await browser.close(); }
});
