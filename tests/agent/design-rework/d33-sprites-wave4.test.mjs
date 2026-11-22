import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

const map = JSON.parse(readFileSync("design/visual-integration/oak-agent-assets-v2.json", "utf8"));
const gallery = new Set(JSON.parse(readFileSync("src/data/dev/oak-states.json", "utf8")).map(state => state.id));
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const wave4 = Object.entries(map.assets).filter(([, asset]) => asset.animated && /-v4\.png$/.test(asset.source));
// A declared variant (R30's reduced-motion copy of a state) shows the same moment, so it is not a second state for the art.
const statesFor = id => Object.entries(map.states).filter(([, entry]) => entry.asset === id && !entry.variantOf).map(([state]) => state);
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");

test("D33-G1 wave 4 loops are 2x2 four-frame sheets with an exact still, one state each and unique files", async () => {
  const poses = wave4.map(([, asset]) => asset.pose);
  for (const pose of ["greeting", "understanding", "weighing", "composing", "verifying"]) assert.ok(poses.includes(pose), `${pose} has a wave 4 loop`);
  assert.ok(wave4.length >= 6, "at least one extra loop replaces a still that stood still while work happens");
  const files = new Map();
  for (const [id, asset] of Object.entries(map.assets)) {
    for (const file of [asset.source, asset.reducedMotionFrame?.source].filter(Boolean)) {
      if (existsSync(file)) files.set(file, [...(files.get(file) ?? []), id]);
    }
  }
  const byHash = new Map();
  for (const file of files.keys()) byHash.set(hash(file), [...(byHash.get(hash(file)) ?? []), file]);
  for (const [id, asset] of wave4) {
    assert.deepEqual([asset.columns, asset.rows, asset.frames], [2, 2, 4], id);
    assert.equal(asset.reducedMotionFrame?.frame, 0, id);
    for (const file of [asset.source, asset.reducedMotionFrame.source]) {
      assert.ok(existsSync(file), `${id} source ${file}`);
      assert.ok(existsSync(`public${file === asset.source ? asset.publicSrc : asset.reducedMotionFrame.publicSrc}`), `${id} public copy of ${file}`);
      assert.deepEqual(files.get(file), [id], `${file} belongs to ${id} only`);
      assert.deepEqual(byHash.get(hash(file)), [file], `${file} duplicates no other image`);
    }
    const meta = await sharp(asset.source).metadata();
    assert.equal(meta.hasAlpha, true, id);
    assert.equal(meta.width % 2 + meta.height % 2, 0, id);
    const cell = { left: 0, top: 0, width: meta.width / 2, height: meta.height / 2 };
    assert.deepEqual(await sharp(asset.reducedMotionFrame.source).raw().toBuffer(), await sharp(asset.source).extract(cell).raw().toBuffer(), `${id} still is the first cell`);
    const corners = await sharp(asset.source).ensureAlpha().extractChannel(3).raw().toBuffer();
    for (const index of [0, meta.width - 1, (meta.height - 1) * meta.width, meta.height * meta.width - 1]) assert.equal(corners[index], 0, `${id} transparent corner`);
    assert.equal(statesFor(id).length, 1, `${id} maps to exactly one state`);
    assert.equal(Object.values(map.assets).filter(other => other.pose === asset.pose).length, 1, `${asset.pose} has one asset`);
  }
});

test("D33-G1 every wave 4 pose is rendered by an agent component", () => {
  const dir = "src/components/agent";
  const source = readdirSync(dir).filter(file => /\.tsx?$/.test(file) && file !== "OakActivitySprite.tsx").map(file => readFileSync(`${dir}/${file}`, "utf8")).join("\n");
  const missing = wave4.map(([, asset]) => asset.pose).filter(pose => !new RegExp(`["'\`]${pose}["'\`]`).test(source));
  assert.deepEqual(missing, []);
});

test("D33-G1 wave 4 loops animate in their gallery states", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const shown = wave4.flatMap(([id, asset]) => statesFor(id).filter(state => gallery.has(state)).map(state => [state, asset.pose]));
    assert.ok(shown.some(([state]) => state === "empty"), "the empty state shows the greeting loop");
    for (const [state, pose] of shown) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      const sprite = page.locator(`[data-pose="${pose}"]`).first();
      await sprite.waitFor({ timeout: 5000 });
      assert.equal(await sprite.getAttribute("data-layout"), "animated", `${state}:${pose}`);
    }
  } finally {
    await browser.close();
  }
});
