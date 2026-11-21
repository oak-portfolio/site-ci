import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const map = JSON.parse(readFileSync("design/visual-integration/oak-agent-assets-v2.json", "utf8"));
const gallery = JSON.parse(readFileSync("src/data/dev/oak-states.json", "utf8")).map(state => state.id);
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};

test("D64-G1 every gallery state has its own art or a written icon-only reason, and each stopped turn shows one picture", async () => {
  // Every state the gallery can show is accounted for in the asset map.
  const unmapped = gallery.filter(id => !map.states[id]);
  assert.deepEqual(unmapped, [], "every gallery state appears in the asset map");
  for (const [id, entry] of Object.entries(map.states)) {
    if (entry.iconOnly) assert.ok(typeof entry.reason === "string" && entry.reason.length > 20, `${id} records why it is icon-only`);
    else assert.ok(map.assets[entry.asset], `${id} maps to a real asset`);
  }
  // No two states borrow the same art. Review v4 supersedes D64 for declared variants: a fixture of the same panel in an
  // earlier moment (contact-brief-start) names its parent with `variantOf` and keeps the parent's art.
  const owners = new Map();
  for (const [id, entry] of Object.entries(map.states)) {
    if (entry.variantOf) {
      assert.equal(entry.asset, map.states[entry.variantOf]?.asset, `${id} keeps ${entry.variantOf}'s art`);
      assert.ok(typeof entry.reason === "string" && entry.reason.length > 20, `${id} records why it shares art`);
      continue;
    }
    if (entry.asset) owners.set(entry.asset, [...(owners.get(entry.asset) ?? []), id]);
  }
  assert.deepEqual([...owners].filter(([, ids]) => ids.length > 1), [], "each asset belongs to one state");
  assert.equal(map.states["contact-brief-start"]?.variantOf, "contact-brief", "the empty brief is a declared variant of the brief");
  // The seven states that used to borrow art now own theirs.
  assert.deepEqual(Object.fromEntries(["reasoning-thoughts", "reasoning-slow", "reasoning-restarted", "model-busy", "answers-paused", "server-unreachable"]
    .map(id => [id, map.states[id].asset])), { "reasoning-thoughts": "pondering", "reasoning-slow": "snail-patience", "reasoning-restarted": "rewind",
    "model-busy": "busy-line", "answers-paused": "short-break", "server-unreachable": "far-server" });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // Where each new piece appears: the live header for reasoning moments, the stopped card for stopped turns.
    const where = { "reasoning-thoughts": [".oak-cot__glyph", "pondering"], "reasoning-slow": [".oak-cot__glyph", "snail-patience"],
      "reasoning-restarted": [".oak-cot__glyph", "rewind"], "model-busy": [".oak-turn__stopped", "busy-line"],
      "answers-paused": [".oak-turn__stopped", "short-break"], "server-unreachable": [".oak-turn__stopped", "far-server"] };
    for (const [state, [scope, pose]] of Object.entries(where)) {
      await open(page, state);
      assert.equal(await page.locator(`${scope} [data-pose="${pose}"]`).count(), 1, `${state} shows ${pose} in ${scope}`);
      // The art is square enough to read at the card's size.
      const box = await page.locator(`${scope} [data-pose="${pose}"]`).boundingBox();
      assert.ok(box && box.width / box.height < 1.2, `${state} art is not a thin strip (${box?.width}x${box?.height})`);
    }
    // A stopped turn's header shows the plain trace icon; its card carries the one picture.
    for (const state of ["model-busy", "failed", "interrupted"]) {
      await open(page, state);
      const turn = page.locator('[data-slot="message"]').last();
      assert.equal(await turn.locator(".oak-cot__glyph [data-pose]").count(), 0, `${state} header has no sprite`);
      assert.ok(await turn.locator("[data-pose]").count() <= 1, `${state} shows at most one picture`);
    }
    await open(page, "model-busy");
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d64-model-busy-1440x900.png" });
  } finally {
    await browser.close();
  }
});
