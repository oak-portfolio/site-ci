import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const map = JSON.parse(readFileSync("design/visual-integration/oak-agent-assets-v2.json", "utf8"));
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const tile = page => page.locator(".oak-research .oak-research__art").evaluate(node => {
  const sprite = node.querySelector(".oak-activity-sprite");
  const box = node.getBoundingClientRect();
  return { pose: sprite?.dataset.pose, width: Math.round(box.width), height: Math.round(box.height),
    still: sprite?.dataset.animated === undefined || sprite?.dataset.reduced !== undefined, image: Boolean(node.querySelector("img")) };
});

test("D91-G1 public research leads with its own globe art tile, registered once and used nowhere else", async () => {
  const expected = { "web-globe": ["research-sources", /oak-agent-web-globe-v5\.png$/], "web-globe-off": ["research-unavailable", /oak-agent-web-globe-off-v5\.png$/] };
  for (const [pose, [state, file]] of Object.entries(expected)) {
    const owners = Object.entries(map.assets).filter(([, asset]) => asset.pose === pose);
    assert.equal(owners.length, 1, `${pose} is registered once`);
    assert.match(owners[0][1].source, file);
    assert.deepEqual(Object.entries(map.states).filter(([, value]) => value.asset === owners[0][0]).map(([id]) => id), [state], `only ${state} uses ${pose}`);
  }
  const browser = await chromium.launch();
  try {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
      for (const [state, pose] of [["research-sources", "web-globe"], ["research-unavailable", "web-globe-off"]]) {
        await open(page, state);
        const art = await tile(page);
        assert.equal(art.pose, pose, `${state}: the card leads with ${pose}`);
        assert.ok(art.image, `${state}: the art is a real image`);
        assert.ok(art.width >= 60 && art.width <= 68 && art.height === art.width, `${state}: a 64px tile (${art.width}x${art.height})`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
