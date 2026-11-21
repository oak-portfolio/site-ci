import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "./gallery.mjs";

const open = async (page, state) => {
  await openState(page, state);
};
const withPage = async (viewport, run) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport })); } finally { await browser.close(); }
};

test("Q09-G1 (v3 review) the Related rows under an answer never clip at 1440, 1280 and 390", async () => {
  // Oak, 2026-10-18: two-line pills over the composer read badly, so follow-ups are full-width rows under the answer.
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) await withPage(viewport, async page => {
    await open(page, "answer-points");
    // Since D3 (2026-11-04) the Related rows sit in the closed "Other ways to continue" drawer when the answer has a next step; open it to measure them.
    const drawer = page.locator(".oak-other-ways__trigger");
    assert.equal(await drawer.count(), 1, `${viewport.width}: answer-points has the drawer`);
    await drawer.click();
    await page.waitForTimeout(400);
    const rows = page.locator(".oak-related .ui-suggestion");
    await rows.first().waitFor({ state: "visible" });
    const shape = await rows.evaluateAll(nodes => nodes.map(node => {
      const label = node.querySelector(".ui-suggestion__label"), box = node.getBoundingClientRect(), list = node.parentElement.getBoundingClientRect();
      return { clipped: label.scrollWidth > label.clientWidth + 1 || box.right > list.right + 1 || box.left < list.left - 1, text: label.textContent };
    }));
    assert.ok(shape.length >= 2, `${viewport.width}: rows render`);
    for (const row of shape) assert.equal(row.clipped, false, `${viewport.width}: "${row.text}" is not cut`);
    assert.equal(await page.locator(".oak-composer .ui-suggestion").count(), 0, `${viewport.width}: no follow-ups over the composer`);
  });
});

// R11 (intentional update, Oak review v8): Tools holds only the message modes. Documents and Dictate are the composer's own
// buttons; saved chats and model funding moved to the header's account menu (tests/agent/design-rework/r11-menus.test.mjs).
test("Q09-G2 the Tools menu lists only Oak's message modes, in one group", async () => {
  await withPage({ width: 1440, height: 900 }, async page => {
    await open(page, "tools-menu");
    const menu = page.locator("[role='menu'][aria-label='Oak tools']");
    await menu.waitFor({ state: "visible" });
    const order = await menu.evaluate(node => [...node.querySelectorAll("[role='group'], [role='separator']")]
      .map(item => item.getAttribute("role") === "separator" ? "|" : [...item.querySelectorAll("[role='menuitem']")].map(row => row.getAttribute("aria-label")).join(",")));
    assert.deepEqual(order, ["Compare a role,Get project advice,Prepare a contact brief"]);
  });
});

test("Q09-G4 Edit question returns the newest question to the box; Continue shows only on a stopped answer; each verb is labeled", async () => {
  await withPage({ width: 1440, height: 900 }, async page => {
    await open(page, "answer-points");
    const edit = page.getByRole("button", { name: "Edit question" });
    assert.equal(await edit.count(), 1, "only the newest question offers it");
    const asked = (await page.locator(".ui-message[data-align='end'] .ui-bubble").last().innerText()).trim();
    await edit.click();
    assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), asked);
    assert.equal(await page.locator("#oak-composer-input").evaluate(node => node === document.activeElement), true, "the box takes focus to edit");
    // exact: the Related drawer's "Other ways to continue" trigger (on since D3, 2026-11-04) is not the stopped answer's Continue.
    assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), 0, "a finished answer offers no Continue");
    assert.equal(await page.getByRole("button", { name: "Ask again" }).count(), 1);

    await open(page, "interrupted");
    await page.getByRole("button", { name: "Continue" }).waitFor({ state: "visible" });
    assert.equal(await page.locator(".oak-turn__stopped").getByRole("button", { name: "Retry" }).count(), 0);
    await open(page, "failed");
    await page.locator(".oak-turn__stopped").getByRole("button", { name: "Retry" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Continue" }).count(), 0, "a failed answer retries, it does not continue");
  });
});
