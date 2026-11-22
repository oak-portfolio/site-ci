import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { jsonForScript } from "../../src/lib/jsonForScript.ts";

const layouts = ["src/layouts/BaseLayout.astro", "src/layouts/OakUtilityLayout.astro", "src/pages/work/[...slug].astro"];

test("Q25-G15 JSON-LD in every layout escapes a closing script tag", () => {
  const out = jsonForScript({ headline: "</script><script>alert(1)</script>", note: "<!-- x" });
  assert.ok(!out.includes("<"), out);
  assert.deepEqual(JSON.parse(out), { headline: "</script><script>alert(1)</script>", note: "<!-- x" });
  for (const file of layouts) {
    const source = readFileSync(file, "utf8");
    const raw = source.match(/set:html=\{JSON\.stringify\(/g) ?? [];
    assert.equal(raw.length, 0, `${file} sets script HTML from raw JSON.stringify`);
    assert.match(source, /set:html=\{jsonForScript\(/, `${file} should use jsonForScript`);
  }
});
