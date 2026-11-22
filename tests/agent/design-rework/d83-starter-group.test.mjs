import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D83-G1 the welcome's starters are one iOS grouped list: one well, hairlines after the icon, tinted meaning tiles and a chevron", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=empty`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForTimeout(600);
    const group = await page.locator(".oak-conversation__starters .ui-suggestions").evaluate(list => {
      const rows = [...list.querySelectorAll(".ui-suggestion")];
      const listBox = list.getBoundingClientRect(), style = getComputedStyle(list);
      return {
        well: { radius: parseFloat(style.borderTopLeftRadius), fill: style.backgroundColor },
        rows: rows.map((row, index) => {
          const own = getComputedStyle(row), tile = row.querySelector(".oak-starter-glyph"), rule = getComputedStyle(row, "::before");
          const icon = row.querySelector(".ui-suggestion__icon").getBoundingClientRect(), label = row.querySelector(".ui-suggestion__label").getBoundingClientRect();
          return { border: own.borderTopWidth, tone: tile?.dataset.tone, tint: tile ? getComputedStyle(tile).backgroundColor : null,
            hairline: index ? { content: rule.content, start: Math.round(parseFloat(rule.insetInlineStart)) , labelStart: Math.round(label.left - row.getBoundingClientRect().left) } : null,
            trailing: !!row.querySelector(".ui-suggestion__trailing svg"), width: Math.round(row.getBoundingClientRect().width), listWidth: Math.round(listBox.width - 2), iconSize: Math.round(icon.width) };
        }),
      };
    });
    assert.ok(group.well.radius >= 16 && group.well.fill !== "rgba(0, 0, 0, 0)", "one rounded, filled well");
    assert.equal(group.rows.length, 3);
    assert.ok(group.rows.every(row => row.border === "0px" && row.width >= row.listWidth - 1), "rows are full-width and borderless inside the well");
    assert.deepEqual(group.rows.map(row => row.tone), ["blue", "violet", "gold"], "each row's tile tint carries its meaning");
    assert.equal(new Set(group.rows.map(row => row.tint)).size, 3, "three distinct tints");
    assert.ok(group.rows.every(row => row.iconSize === 32 && row.trailing), "32px tiles and a closing chevron");
    // The closing glyph is the Hugeicons chevron (ArrowRight01), not the arrow with a shaft that read as a link.
    assert.match(readFileSync("src/components/agent/OakEmptyState.tsx", "utf8"), /trailing=\{<Icon name="chevronRight" \/>\}/);
    assert.match(readFileSync("src/components/ui/Icon.tsx", "utf8"), /chevronRight: ArrowRight01Icon/);
    assert.match(readFileSync("src/components/agent/OakEmptyState.tsx", "utf8"), /page: \{ name: "identityFile", tone: "leaf" \}/, "a page's own project reads leaf"); // Q08 (intentional update): glyphs key on intent
    for (const row of group.rows.slice(1)) {
      assert.notEqual(row.hairline.content, "none", "a hairline separates the rows");
      assert.ok(Math.abs(row.hairline.start - row.hairline.labelStart) <= 2, `the hairline starts where the words do (${row.hairline.start} vs ${row.hairline.labelStart})`);
    }
  } finally {
    await browser.close();
  }
});
