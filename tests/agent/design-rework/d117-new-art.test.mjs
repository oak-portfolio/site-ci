import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const read = file => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

test("D117-G1 four new pictures join the art set and show where they mean something; the funding picture follows the choice", async () => {
  const assets = JSON.parse(read("design/visual-integration/oak-agent-assets-v2.json")).assets;
  const manifest = JSON.parse(read("public/assets/generated/optimized-images-manifest.json"));
  const entries = Array.isArray(manifest) ? manifest : manifest.images ?? Object.values(manifest);
  for (const pose of ["brief-letter", "doc-stack", "own-key", "keep-calendar"]) {
    assert.equal(assets[pose]?.pose, pose, `${pose} is in the art manifest`);
    // The mapped file, whichever version it is now (D132 turned the v6 brief letter into a v7 loop).
    const file = assets[pose].source.split("/").pop().replace(/\.png$/, "");
    assert.ok(JSON.stringify(entries).includes(file), `${pose} has optimized AVIF and WebP sizes`);
    assert.match(read("src/components/agent/OakActivitySprite.tsx"), new RegExp(`"${pose}"`), `${pose} is a declared pose`);
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=funding`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const hero = () => page.locator(".oak-workflow .oak-panel-hero .oak-activity-sprite").getAttribute("data-pose");
    assert.equal(await hero(), "coins", "Oak's allowance shows the coin pouch");
    await page.getByRole("radio", { name: /My OpenRouter account/ }).click();
    await page.waitForFunction(() => document.querySelector(".oak-workflow .oak-panel-hero .oak-activity-sprite")?.getAttribute("data-pose") === "own-key", null, { timeout: 3000 });
    assert.equal(await hero(), "own-key", "the visitor's own account shows the acorn key");
    assert.equal(await page.locator(".oak-workflow .oak-panel-hero").getAttribute("data-tone"), "gold");
    // The pose swap changes the image source, so give the new picture its load.
    const loaded = await page.waitForFunction(() => { const image = document.querySelector(".oak-workflow .oak-panel-hero img"); return image?.complete && image.naturalWidth > 0; },
      null, { timeout: 5000 }).then(() => true, () => false);
    assert.ok(loaded, "the picture loads");
  } finally {
    await browser.close();
  }
});
