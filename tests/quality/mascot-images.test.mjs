import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createMascotImageSets, renderMascotImageSets } from "../../scripts/lib/mascot-image-sets.mjs";
import { getMascotImageSet } from "../../src/data/generated/mascotImageSets.ts";
import { buildImageSet } from "../../src/data/generated/optimizedImages.ts";
import { oakMascotSprite } from "../../src/data/oakMascot.ts";

const manifest = JSON.parse(await readFile(new URL("../../public/assets/generated/optimized-images-manifest.json", import.meta.url), "utf8"));

test("every runtime sprite keeps its original AVIF, WebP, and fallback image-set", () => {
  const sources = new Set([oakMascotSprite.src, ...Object.values(oakMascotSprite.animations).map((animation) => animation.src).filter(Boolean)]);
  const generated = createMascotImageSets(manifest);
  for (const src of sources) {
    assert.ok(generated[src], `Missing generated sprite: ${src}`);
    assert.equal(getMascotImageSet(src), buildImageSet(src));
  }
  assert.ok(Object.keys(generated).every((src) => src.startsWith("/assets/mascot/")));
  assert.ok(JSON.stringify(generated).length < 15000, "Sprite map must not include the full image catalog");
});

test("checked-in sprite map stays aligned with image generation", async () => {
  const saved = await readFile(new URL("../../src/data/generated/mascotImageSets.ts", import.meta.url), "utf8");
  assert.equal(saved, renderMascotImageSets(manifest));
});

test("missing WebP fallback fails generation", () => {
  assert.throws(() => createMascotImageSets({ sprite: { src: "/assets/mascot/test.webp", category: "mascot", imageSet: { avif: "/test.avif" }, fallbackFormat: "webp" } }), /needs AVIF and WebP/);
});
