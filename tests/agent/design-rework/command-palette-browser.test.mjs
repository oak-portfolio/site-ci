import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 47 in a real browser: OAK_PALETTE_URL is a dev server with the palette constant on.
const base = process.env.OAK_PALETTE_URL;
const key = process.platform === "darwin" ? "Meta+k" : "Control+k";

test("a second Cmd K while the palette is open leaves Escape returning focus to the Search button", { skip: !base && "set OAK_PALETTE_URL" }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(new URL("/", base).href, { waitUntil: "networkidle" });
    const search = page.getByRole("button", { name: "Search pages, sections and projects" }).first();
    await search.click();
    const field = page.getByRole("combobox", { name: "Search without asking" });
    await field.waitFor();
    await page.waitForTimeout(300);
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    assert.equal(await field.evaluate((node) => node === document.activeElement), true, "the field keeps focus");
    await page.keyboard.press("Escape");
    await field.waitFor({ state: "hidden" });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Search pages, sections and projects");
  } finally { await browser.close(); }
});
