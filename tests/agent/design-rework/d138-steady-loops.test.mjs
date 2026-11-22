import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { chromium } from "playwright";
import { spriteLoopDrift } from "../../../scripts/align-sprite-loop.mjs";

// D138: every 2x2 loop keeps its subject in place from frame to frame (no hop, no sliver of the next frame), and the
// tool panels' heroes are loops too.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const assets = JSON.parse(readFileSync(new URL("../../../design/visual-integration/oak-agent-assets-v2.json", import.meta.url), "utf8")).assets;
// The magnifier sweeps across its cell on purpose; every other loop moves only a part of a still subject.
const travels = new Set(["searching"]);

test("D138-G1 every loop holds its subject in place on the exact grid, and its still is its exact first cell", async () => {
  const loops = Object.entries(assets).filter(([, asset]) => asset.animated && !travels.has(asset.pose));
  assert.ok(loops.length >= 18, `the loops are all checked (${loops.length})`);
  for (const [id, asset] of loops) {
    const { drift, edge } = await spriteLoopDrift(asset.source);
    assert.ok(drift <= 2, `${id}: frames sit where frame 1 is (drift ${drift}px)`);
    assert.equal(edge, 0, `${id}: nothing touches a cell edge`);
    const meta = await sharp(asset.source).metadata();
    const cell = { left: 0, top: 0, width: Math.floor(meta.width / 2), height: Math.floor(meta.height / 2) };
    assert.deepEqual(await sharp(asset.reducedMotionFrame.source).raw().toBuffer(), await sharp(asset.source).extract(cell).raw().toBuffer(),
      `${id}: the still is the first cell`);
  }
});

test("D138-G2 the role, advice, documents and funding panels lead with a loop that rests after two plays", async () => {
  for (const [id, pose] of [["oak-reviewing-v1", "reviewing"], ["planning", "planning"], ["doc-stack", "doc-stack"], ["coins", "coins"]])
    assert.equal(assets[id].pose === pose && assets[id].animated, true, `${pose} is a loop`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const [state, pose] of [["role-fit", "reviewing"], ["advice-intake", "planning"], ["document-upload", "doc-stack"], ["funding", "coins"]]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      const sprite = page.locator(`.oak-panel-hero .oak-activity-sprite[data-pose="${pose}"]`);
      await sprite.waitFor({ timeout: 3000 });
      assert.equal(await sprite.getAttribute("data-layout"), "animated", `${state}: the hero is a loop`);
      assert.equal(await sprite.locator(".oak-activity-sprite__sheet").evaluate(node => getComputedStyle(node).animationIterationCount), "2", `${state}: two plays, then rest`);
    }
  } finally {
    await browser.close();
  }
});
