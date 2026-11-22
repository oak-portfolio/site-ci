import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import { chromium } from "playwright";
import sharp from "sharp";
import ts from "typescript";
import { strictLoader } from "./load-tsx.mjs";

const root = new URL("../../../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const map = JSON.parse(read("design/visual-integration/oak-agent-assets-v2.json"));
const component = read("src/components/agent/OakActivitySprite.tsx");
const css = read("src/components/agent/OakActivitySprite.css");
const parsed = ts.createSourceFile("OakActivitySprite.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const host = strictLoader(import.meta.url, { missing: "empty" })("src/components/agent/OakActivitySprite.tsx", { "react/jsx-runtime": jsx, react: React });

test("D09-G2 sprite poses exactly match the asset map and wave has a real state", () => {
  const alias = parsed.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === "OakActivitySpritePose");
  assert.ok(alias && ts.isUnionTypeNode(alias.type));
  const poses = alias.type.types.map((node) => node.literal.text).sort();
  const mapped = [...new Set(Object.values(map.assets).map((asset) => asset.pose))].sort();
  assert.deepEqual(poses, mapped);
  assert.equal(map.assets[map.states["follow-ups"].asset].pose, "wave");
  for (const asset of Object.values(map.assets)) {
    const markup = renderToStaticMarkup(createElement(host.OakActivitySprite, {
      pose: asset.pose,
      asset: { src: asset.publicSrc, width: 627, height: 627, avifSrcSet: "", webpSrcSet: "" },
    }));
    assert.ok(markup.includes(`data-pose="${asset.pose}"`));
    assert.ok(markup.includes('data-layout="single"'));
  }
});

test("D09-G3 animated sheets have exact static frames selected under reduced motion", async () => {
  const animated = Object.entries(map.assets).filter(([, asset]) => asset.animated);
  assert.ok(animated.length > 0);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    for (const [id, asset] of animated) {
      assert.deepEqual([asset.columns, asset.rows, asset.frames], [2, 2, 4], id);
      const sheet = readFileSync(new URL(asset.source, root));
      const still = readFileSync(new URL(asset.reducedMotionFrame.source, root));
      const dimensions = await sharp(sheet).metadata();
      assert.equal(dimensions.hasAlpha, true, id);
      assert.equal(asset.reducedMotionFrame.frame, 0, id);
      const extracted = await sharp(sheet).extract({ left: 0, top: 0, width: dimensions.width / 2, height: dimensions.height / 2 }).raw().toBuffer();
      assert.deepEqual(await sharp(still).raw().toBuffer(), extracted, id);
      const image = { src: `data:image/png;base64,${sheet.toString("base64")}`, width: dimensions.width, height: dimensions.height, avifSrcSet: "", webpSrcSet: "" };
      const staticImage = { ...image, src: `data:image/png;base64,${still.toString("base64")}`, width: dimensions.width / 2, height: dimensions.height / 2 };
      const markup = renderToStaticMarkup(createElement(host.OakActivitySprite, {
        pose: asset.pose,
        asset: { ...image, animation: { frames: 4, columns: 2, rows: 2, reducedMotion: staticImage } },
      }));
      await page.setContent(`<style>:root { --motion-page: 320ms; } ${css}</style>${markup}`);
      await page.locator("img").evaluate((img) => img.decode());
      assert.equal(await page.locator("img").evaluate((img) => img.currentSrc), staticImage.src, id);
      const geometry = await page.locator("picture").evaluate((picture) => ({
        animation: getComputedStyle(picture).animationName,
        width: picture.getBoundingClientRect().width,
        frameWidth: picture.parentElement.getBoundingClientRect().width,
      }));
      assert.equal(geometry.animation, "none", id);
      assert.equal(geometry.width, geometry.frameWidth, id);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      assert.equal(await page.locator("picture").evaluate((picture) => getComputedStyle(picture).animationName), "oak-activity-sprite-frames", id);
      await page.emulateMedia({ reducedMotion: "reduce" });
    }
  } finally {
    await browser.close();
  }
});
