import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(700);
};

test("D70-G1 every panel leads with its art, form rows lead with semantic icons, and account purposes read at a glance", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["contact-brief", "question-draft", "role-fit", "advice-intake", "funding", "account-purpose", "document-upload", "saved-list", "voice-off"]) {
      await open(page, state);
      const hero = await page.evaluate(() => {
        const tile = document.querySelector(".oak-workflow .oak-panel-hero");
        const nav = document.querySelector(".oak-workflow .oak-panel-nav");
        if (!tile || !nav) return null;
        const box = tile.getBoundingClientRect();
        return { below: box.top >= nav.getBoundingClientRect().bottom - 1, size: Math.round(box.width), art: !!tile.querySelector("img"),
          navArt: !!nav.querySelector(".oak-panel-nav__mark img") };
      });
      assert.ok(hero, `${state}: a panel hero`);
      assert.ok(hero.below, `${state}: the art sits under the nav bar`);
      assert.ok(hero.size >= 88, `${state}: a header-sized tile (${hero.size}px)`);
      assert.ok(hero.art, `${state}: the tile holds the panel's art`);
      assert.equal(hero.navArt, false, `${state}: one picture per panel, not a second one in the nav`);
    }

    for (const [state, expected] of [["contact-brief", 3], ["question-draft", 2]]) {
      await open(page, state);
      // D116 re-tick: a brief field's icon tile now leads its label above the well, so measure to the label's words.
      const rows = await page.locator(".oak-workflow :is(.oak-group__row:has(> .oak-group__icon), .oak-brief__wells > .ui-field)").evaluateAll(list => list.map(row => {
        const icon = row.querySelector(".oak-group__icon").getBoundingClientRect(), labelNode = row.querySelector(".ui-field__label");
        const words = [...labelNode.childNodes].find(node => node.nodeType === 3 && node.textContent.trim());
        const range = document.createRange(); if (words) range.selectNodeContents(words);
        const label = words ? range.getBoundingClientRect() : labelNode.getBoundingClientRect();
        return { svg: !!row.querySelector(".oak-group__icon svg"), beside: icon.right <= label.left, gap: Math.round(label.left - icon.right) };
      }));
      assert.equal(rows.length, expected, `${state}: every field row leads with an icon`);
      for (const row of rows) {
        assert.ok(row.svg && row.beside, `${state}: icon sits left of its label`);
        assert.ok(row.gap >= 12, `${state}: room between icon and label (${row.gap}px)`);
      }
    }

    await open(page, "account-purpose");
    const choices = await page.locator(".ui-questionnaire__choice").evaluateAll(list => list.map(choice => {
      const icon = choice.querySelector(".ui-questionnaire__icon"), key = choice.querySelector(".ui-questionnaire__shortcut");
      return { icon: !!icon?.querySelector("svg"), keyRight: key && icon ? key.getBoundingClientRect().left > icon.getBoundingClientRect().right : false };
    }));
    assert.equal(choices.length, 5, "five purposes");
    for (const choice of choices) assert.ok(choice.icon && choice.keyRight, "each purpose leads with an icon and keeps its letter key at the right");
  } finally {
    await browser.close();
  }
});
