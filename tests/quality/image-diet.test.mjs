import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getCompactMascotImageSet } from "../../src/data/generated/mascotImageSets.ts";
import { oakMascotSprite } from "../../src/data/oakMascot.ts";

const root = new URL("../../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");
const manifest = JSON.parse(await read("public/assets/generated/optimized-images-manifest.json"));

test("phones get a compact mascot sheet under 450 KB", async () => {
  const sheet = manifest[oakMascotSprite.src];
  const compact = sheet.variants.avif.find((variant) => variant.width === 1024);
  assert.ok(compact, "the sprite sheet needs a 1024 AVIF step");
  assert.ok(compact.bytes < 450 * 1024, `compact sheet is ${compact.bytes} bytes`);
  const imageSet = getCompactMascotImageSet(oakMascotSprite.src);
  assert.match(imageSet, /oak-web-spritesheet-1024\.avif/);
  assert.doesNotMatch(imageSet, /oak-web-spritesheet-1536/);

  const mascot = await read("src/components/OakMascot.tsx");
  assert.match(mascot, /--oak-sprite-image-compact/);
  assert.doesNotMatch(mascot, /backgroundImage: spriteBackgroundImage/, "inline image would force the full sheet on phones");

  const css = await read("src/styles/global.css");
  for (const selector of [".oak-mascot__sprite", ".oak-mascot__crown"]) {
    const base = css.match(new RegExp(`\\n${selector.replace(".", "\\.")} \\{[^}]*\\}`));
    assert.ok(base, `${selector} base rule missing`);
    assert.match(base[0], /background-image: var\(--oak-sprite-image-compact\)/, `${selector} must start on the compact sheet at every width`);
  }
});

test("desktop upgrades to the full mascot sheet only after load, with the compact sheet kept underneath", async () => {
  const css = await read("src/styles/global.css");
  const upgrade = css.match(/@media \(min-width: 821px\) and \(min-resolution: 1\.25dppx\) \{\s*\.oak-mascot\[data-sheet="full"\] \.oak-mascot__sprite,\s*\.oak-mascot\[data-sheet="full"\] \.oak-mascot__crown \{\s*background-image: var\(--oak-sprite-image\), var\(--oak-sprite-image-compact\);/);
  assert.ok(upgrade, "the full sheet must be gated on data-sheet and layered over the compact sheet");
  const unconditional = css.split("\n").filter((line) => /background-image:\s*var\(--oak-sprite-image\)/.test(line));
  assert.equal(unconditional.length, 1, "only the data-sheet rule may reference the full sheet");

  const mascot = await read("src/components/OakMascot.tsx");
  assert.match(mascot, /function useFullSpriteSheet/);
  assert.match(mascot, /document\.readyState === "complete"[\s\S]{0,120}addEventListener\("load"/, "the upgrade must wait for the load event");
  assert.match(mascot, /requestIdleCallback/);
  assert.match(mascot, /data-sheet=\{fullSpriteSheet \? "full" : undefined\}/);
  assert.doesNotMatch(mascot, /"--oak-sprite-image": spriteImage[^}]*backgroundImage/);
});

test("header portrait ships AVIF and WebP, not the 75 KB PNG", async () => {
  const profile = manifest["/assets/brand/oak-profile.png"];
  const smallest = Math.min(...profile.variants.avif.filter((variant) => variant.width >= 128).map((variant) => variant.bytes));
  assert.ok(smallest < 20 * 1024);

  const header = await read("src/components/SiteHeader.tsx");
  assert.match(header, /<picture className="brand-logo__portrait-picture">/);
  assert.match(header, /type="image\/avif"/);
  assert.match(header, /type="image\/webp"/);

  const layout = await read("src/layouts/BaseLayout.astro");
  assert.match(layout, /portraitSources=/);
});

test("prune step removes every dev-only public asset from the build", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "r31-prune-"));
  try {
    for (const dir of ["assets/dev/hero-variants", "assets/dev/other-drafts"]) {
      mkdirSync(path.join(cwd, "dist", dir), { recursive: true });
      writeFileSync(path.join(cwd, "dist", dir, "draft.png"), "x");
    }
    mkdirSync(path.join(cwd, "dist/assets/brand"), { recursive: true });
    writeFileSync(path.join(cwd, "dist/assets/brand/keep.png"), "x");
    const run = spawnSync(process.execPath, [new URL("scripts/prune-public-build-assets.mjs", root).pathname], { cwd, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(existsSync(path.join(cwd, "dist/assets/dev")), false);
    assert.equal(existsSync(path.join(cwd, "dist/assets/brand/keep.png")), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
