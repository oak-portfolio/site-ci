import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { OAK_MERGES, oakMergeJson, oakMergeStrays } from "../../../scripts/openui/build-prompt.mjs";

const list = { output: "src/data/dev/oak-states.json", from: "src/data/dev/oak-states/" };
const keyed = { output: "design/visual-integration/oak-agent-assets-v2.json", key: "states", from: "design/visual-integration/oak-agent-assets/" };
const states = '[\n  {"id":"a","label":"A"},\n  {"id":"hand","label":"H"}\n]\n';
const assets = '{\n  "version": 2,\n  "states": {\n    "a": {"asset":"x"},\n    "hand": {"iconOnly":true}\n  }\n}\n';

test("merge: --check names an output entry that no fragment defines", () => {
  assert.deepEqual(oakMergeStrays(states, list, [[{ id: "a", label: "A" }]]),
    ["hand lives only in src/data/dev/oak-states.json; move it to a fragment in src/data/dev/oak-states/"]);
  assert.deepEqual(oakMergeStrays(assets, keyed, [{ a: { asset: "x" } }]),
    ["hand lives only in design/visual-integration/oak-agent-assets-v2.json; move it to a fragment in design/visual-integration/oak-agent-assets/"]);
  assert.deepEqual(oakMergeStrays(states, list, [[{ id: "a" }], [{ id: "hand" }]]), []);
});

test("merge: an output is built from its fragments alone, in fragment order", () => {
  assert.deepEqual(JSON.parse(oakMergeJson(states, list, [[{ id: "b" }], [{ id: "a", label: "A2" }]])), [{ id: "b" }, { id: "a", label: "A2" }]);
  assert.deepEqual(JSON.parse(oakMergeJson(assets, keyed, [{ a: { asset: "y" } }])).states, { a: { asset: "y" } });
});

test("merge: no checked-in output holds an entry its fragments lack", () => {
  for (const merge of OAK_MERGES) {
    const fragments = readdirSync(merge.from).filter(file => file.endsWith(merge.suffix ?? ".json")).sort().map(file => JSON.parse(readFileSync(`${merge.from}${file}`, "utf8")));
    assert.deepEqual(oakMergeStrays(readFileSync(merge.output, "utf8"), merge, fragments), [], merge.output);
  }
});
