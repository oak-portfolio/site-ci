import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { oakOpenUIGenerated } from "../../../scripts/openui/build-prompt.mjs";

// Ticket 57 review r1 P1: an argument behind a constant that ships false never reaches the model's prompt or spec.json.
// Ticket 238: render-spec.json is the render library, which always parses the argument, so a stored or early answer draws.
const dir = "packages/oak-agent-contracts/src/openui/";
const GATES = [
  { flag: "src/lib/oakFlags/headingChip.ts", name: "oakHeadingChip", component: "Heading", arg: "from" },
  { flag: "src/lib/oakFlags/calloutKinds.ts", name: "oakCalloutKinds", component: "Callout", arg: "kind" },
  { flag: "src/lib/oakFlags/kindDecisions.ts", name: "oakKindDecisions", component: "Points", arg: "mode" },
];
const committed = Object.fromEntries(["spec.json", "render-spec.json", "system-prompt.ts"].map(file => [file, readFileSync(`${dir}${file}`, "utf8")]));
const live = oakOpenUIGenerated(loadTsx("src/lib/openui.tsx"));

for (const { flag, name, component, arg } of GATES) test(`${component}(${arg}) stays out of the prompt and spec.json while ${name} is off`, () => {
  const on = loadTsx(flag)[name];
  for (const [source, files] of [["committed", committed], ["generated now", live]]) {
    for (const [file, taught] of [["spec.json", on], ["render-spec.json", true]]) {
      const spec = JSON.parse(files[file]);
      assert.equal(spec.components[component].signature.includes(`${arg}?`), taught, `${source} ${file} signature`);
      assert.equal(arg in spec.schema.$defs[component].properties, taught, `${source} ${file} schema`);
    }
    assert.equal(new RegExp(`\\b${component}\\([^)]*\\b${arg}\\?`).test(JSON.parse(files["system-prompt.ts"].match(/= (".*");\n$/s)[1])), on, `${source} system prompt`);
  }
});
