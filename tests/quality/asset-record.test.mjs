// Run: node --test tests/quality/asset-record.test.mjs (part of npm run test:quality).
// Ticket 62: the asset record behind the owner console's Assets tab, built from Work MDX and brandIconRegistry.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const { buildAssetRecord } = await import(path.join(root, "scripts/assets/build-asset-record.mjs"));
const generated = JSON.parse(readFileSync(path.join(root, "src/data/assetRecord.generated.json"), "utf8"));

test("the generated asset record matches a fresh build", () => {
  assert.deepEqual(generated, buildAssetRecord(root), "run node scripts/assets/build-asset-record.mjs");
});

test("every image has alt text per use and a used-in list", () => {
  assert.ok(generated.assets.length > 20, `only ${generated.assets.length} assets`);
  for (const asset of generated.assets) {
    assert.match(asset.id, /^[a-f0-9]{12}$/);
    assert.match(asset.src, /^\/assets\//);
    assert.ok(asset.uses.length > 0, `${asset.src} has no uses`);
    for (const use of asset.uses) {
      assert.ok(use.alt.trim().length > 0, `${asset.src} has no alt for ${use.use} in ${use.where}`);
      assert.ok(use.use && use.where, asset.src);
    }
    assert.ok(asset.usedIn.length > 0, `${asset.src} is used nowhere`);
    assert.deepEqual(asset.usedIn, [...new Set(asset.uses.map((use) => use.where))]);
    assert.match(asset.focal, /^(center|\d{1,3}% \d{1,3}%)$/);
    assert.ok(asset.rights.length > 0);
    assert.ok(["work", "brand"].includes(asset.kind));
  }
});

test("the record covers Work frontmatter, Work figures and brand icons", () => {
  const uses = generated.assets.flatMap((asset) => asset.uses.map((use) => use.use));
  for (const use of ["card", "hero", "social", "figure", "brand icon"]) assert.ok(uses.includes(use), `no ${use} use`);
  const cover = generated.assets.find((asset) => asset.src === "/assets/work/ecosmartloop/ecosmartloop-cover.png");
  assert.ok(cover, "EcoSmartLoop cover is in the record");
  assert.deepEqual(cover.uses.map((use) => use.use).sort(), ["card", "hero"]);
});
