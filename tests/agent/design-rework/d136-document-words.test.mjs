import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// D136: Oak, "I don't like the bytes thing, it is not human friendly." A prepared document says how many words were read.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D136-G1 a prepared document counts the words read, never bytes", async () => {
  assert.doesNotMatch(readFileSync(new URL("../../../src/components/agent/OakDocumentsPanel.tsx", import.meta.url), "utf8"), /bytes extracted/);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=document-selected`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const description = await page.locator(".oak-documents__doc .ui-attachment__description, .oak-documents__doc [data-slot='attachment-description']").first().innerText();
    // v3 review (intentional update): type, words and parts; the title above is the file's own name.
    assert.match(description, /^DOCX · [\d,]+ words? · \d+ parts?$/, description);
    assert.equal(await page.locator(".oak-documents__doc .oak-documents__title").first().innerText(), "senior-design-engineer.docx");
    assert.doesNotMatch(await page.locator(".oak-workspace").innerText(), /\bBlock \d|Document \d/, "no block or document numbers");
    assert.doesNotMatch(await page.locator(".oak-workspace").innerText(), /\bbytes\b/i, "no byte counts anywhere in the panel");
  } finally {
    await browser.close();
  }
});
