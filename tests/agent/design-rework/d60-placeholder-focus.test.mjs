import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { galleryStates as states } from "../premium/gallery.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};

test("D60-G1 a pending answer shows no skeleton (D124), and every text field focuses with the launcher ring", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let pending = 0;
    for (const { id } of states) {
      await open(page, id);
      const turns = await page.evaluate(() => [...document.querySelectorAll('[data-slot="message"][data-align="start"]')].map(turn => ({
        state: turn.getAttribute("data-state"), answered: !!turn.querySelector(".oak-turn__answer"),
        lines: turn.querySelectorAll(".oak-turn__placeholder .ui-skeleton").length })));
      for (const [index, turn] of turns.entries()) {
        if (turn.state === "pending" && !turn.answered) pending++;
        assert.equal(turn.lines, 0, `${id} turn ${index + 1}: no skeleton lines (${turn.state})`);
      }
    }
    assert.ok(pending >= 6, `measured ${pending} pending turns`);

    for (const [state, selector] of [["voice-review", ".oak-voice textarea"], ["contact-brief", ".oak-workspace__reading textarea"],
      ["question-draft", ".oak-group__body input"], ["role-fit", ".oak-role-intake textarea"], ["document-upload", ".oak-documents textarea"]]) {
      await open(page, state);
      const field = page.locator(selector).first();
      await field.focus();
      await page.keyboard.press("End");
      await page.waitForTimeout(250);
      const focus = await field.evaluate(node => {
        const host = node.closest(".ui-input-group") ?? node.closest(".oak-group__body") ?? node;
        // Review v5 supersedes: at full screen the ring is a masked ::after edge, so it is read from either layer.
        const edge = getComputedStyle(host, "::after").backgroundImage;
        return { outline: getComputedStyle(node).outlineStyle, hostOutline: getComputedStyle(host).outlineStyle, ring: edge !== "none" ? `linear-gradient(edge) ${edge}` : getComputedStyle(host).backgroundImage };
      });
      assert.equal(focus.outline, "none", `${state}: no outline on the field`);
      assert.equal(focus.hostOutline, "none", `${state}: no outline on its group`);
      assert.match(focus.ring, /linear-gradient[\s\S]*linear-gradient/, `${state}: the launcher ring is the edge`);
    }
    await open(page, "contact-brief");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const button = await page.evaluate(() => { const node = document.activeElement; return node?.matches("button, a") ? getComputedStyle(node).outlineStyle : "not-a-button"; });
    assert.notEqual(button, "none", "a focused button keeps a visible outline");
  } finally {
    await browser.close();
  }
});
