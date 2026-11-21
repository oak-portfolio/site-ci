// Run: node --test tests/owner/console-table-390.test.mjs
// Health, Release and Keys tables must not cut a cell at the card edge at 390, label every stacked cell, and keep the table layout at 1280.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../agent/design-rework/load-tsx.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const skip = existsSync(chromium.executablePath()) ? false : "no Playwright browser on this runner";
const { fixtureReads } = loadTsx("src/components/owner/console/fixtures.ts");
const { OwnerConsole } = loadTsx("src/components/owner/console/OwnerConsole.tsx");
const css = ["src/styles/global.css", "src/styles/owner-console.css"].map(file => readFileSync(path.join(root, file), "utf8")).join("\n");
const html = tab => renderToStaticMarkup(React.createElement(OwnerConsole, { initialTab: tab, initialReads: fixtureReads("signed-in", Date.UTC(2026, 10, 4, 18, 30)) }));

async function measure(tab, width) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body>${html(tab)}</body>`);
    return await page.evaluate(() => [...document.querySelectorAll(".oc-table")].map(box => {
      const edge = box.getBoundingClientRect().right;
      const cells = [...box.querySelectorAll("th, td")].filter(cell => cell.getClientRects().length);
      const tds = cells.filter(cell => cell.tagName === "TD");
      const spread = cell => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const rects = [...range.getClientRects()].filter(r => r.width > 0).sort((a, b) => a.left - b.left);
        let widest = 0;
        for (let i = 1; i < rects.length; i++) if (Math.abs(rects[i].top - rects[i - 1].top) < 12) widest = Math.max(widest, rects[i].left - rects[i - 1].right);
        return widest;
      };
      return {
        label: box.getAttribute("aria-label"),
        scrolls: box.scrollWidth > box.clientWidth + 1,
        cut: cells.filter(cell => cell.getBoundingClientRect().right > edge + 1).length,
        unlabeled: tds.filter(cell => !cell.getAttribute("data-label")).length,
        widestGap: Math.max(0, ...tds.map(spread)),
        rowDisplay: getComputedStyle(box.querySelector("tbody tr")).display,
      };
    }));
  } finally {
    await browser.close();
  }
}

for (const tab of ["health", "release", "keys"]) {
  test(`${tab}: at 390 no table cell is cut at the card edge and nothing scrolls inside the card`, { skip }, async () => {
    const tables = await measure(tab, 390);
    assert.ok(tables.length >= 1, "the signed-in fixture draws a table");
    for (const table of tables) {
      assert.equal(table.cut, 0, `${table.label}: cells past the card edge`);
      assert.equal(table.scrolls, false, `${table.label}: scrolls sideways inside its card`);
      assert.equal(table.unlabeled, 0, `${table.label}: stacked cells without a data-label read as bare values`);
      assert.ok(table.widestGap <= 24, `${table.label}: a cell value sits apart from its chip (${table.widestGap}px)`);
    }
  });

  test(`${tab}: at 1280 the table keeps its table rows`, { skip }, async () => {
    for (const table of await measure(tab, 1280)) {
      assert.equal(table.rowDisplay, "table-row", `${table.label}: row layout`);
      assert.equal(table.scrolls, false, `${table.label}: fits at 1280`);
    }
  });
}

test("Release does not name a ticket number in an owner-facing string", () => {
  assert.doesNotMatch(html("release").replace(/<[^>]+>/g, " "), /ticket\s*\d+/i);
});
