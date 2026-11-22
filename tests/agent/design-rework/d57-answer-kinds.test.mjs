import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { galleryStates as states } from "../premium/gallery.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(700);
};

test("D57-G1 every answer kind says something: a handoff card for contact, a nod for a decline, no empty answers anywhere", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const empty = [];
    for (const { id } of states) {
      await open(page, id);
      const found = await page.evaluate(() => [...document.querySelectorAll('[data-slot="message"][data-align="start"][data-state="complete"]')]
        .filter(turn => turn.querySelector(".oak-turn__answer"))
        .map(turn => { const answer = turn.querySelector(".oak-turn__answer"); const clone = answer.cloneNode(true);
          clone.querySelectorAll('[data-slot="message-footer"], .ui-message__footer, .sr-only').forEach(node => node.remove());
          return clone.textContent.trim().length; }));
      found.forEach((length, index) => { if (length < 2) empty.push(`${id} turn ${index + 1}`); });
    }
    assert.deepEqual(empty, [], "no finished answer is empty");

    await open(page, "answer-declined");
    const turns = page.locator('[data-slot="message"][data-align="start"]');
    const handoff = turns.nth(0).locator(".oak-turn__handoff");
    assert.equal(await handoff.count(), 1, "the contact answer is a handoff card");
    assert.equal(await handoff.getAttribute("data-tone"), "handoff");
    assert.equal(await handoff.locator(".oak-turn__stopped-title").innerText(), "That one's for Steve");
    assert.ok((await handoff.locator(".oak-turn__stopped-detail").innerText()).length < 100, "one short line");
    assert.equal(await handoff.locator('.oak-turn__stopped-art [data-pose="handoff"]').count(), 1, "the card has its own signpost art");
    const nod = turns.nth(1).locator(".oak-turn__ack");
    assert.match(await nod.innerText(), /I.ll stop here/);
    assert.equal(await nod.locator('[data-pose="nod"]').count(), 1, "the nod has its own bow art");
    for (const index of [0, 1]) {
      assert.equal(await turns.nth(index).getByRole("button", { name: /Copy answer/ }).count(), 0, `turn ${index + 1} has no copy action`);
      assert.equal(await turns.nth(index).locator(".oak-turn__open-in").count(), 0, `turn ${index + 1} has no open-in links`);
    }
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d57-handoff.png" });

    await handoff.getByRole("button", { name: "Contact Steve" }).click();
    await page.locator(".oak-contact__email").waitFor({ timeout: 3000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await handoff.getByRole("button", { name: "Draft my question" }).click();
    await page.getByRole("heading", { name: "Draft a question for Steve" }).waitFor({ timeout: 3000 });
    assert.equal(await page.getByLabel("Topic").count(), 1, "the question panel opened with its Topic field");
  } finally {
    await browser.close();
  }
});
