import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { OAK_MERGES, oakMergeJson } from "../../../scripts/openui/build-prompt.mjs";

const states = '[\n  { "id": "a", "label": "A" },\n  {"id":"b","label":"B"}\n]\n';
const pretty = '{\n "note": "n",\n "sets": [\n  {\n   "id": "a"\n  }\n ]\n}\n';
const assets = '{\n  "version": 2,\n  "states": {\n    "a": { "asset": "x" },\n    "b": { "iconOnly": true }\n  },\n  "assets": {}\n}\n';

test("fragments: with the checked-in fragments every merged output is its own text, byte for byte", () => {
  for (const merge of OAK_MERGES) {
    const text = readFileSync(merge.output, "utf8");
    const fragments = readdirSync(merge.from).filter(file => file.endsWith(merge.suffix ?? ".json")).sort().map(file => JSON.parse(readFileSync(`${merge.from}${file}`, "utf8")));
    assert.equal(oakMergeJson(text, merge, fragments), text, merge.output);
  }
});

test("fragments: merging again changes nothing, and an edited fragment replaces its entry", () => {
  const merged = oakMergeJson(states, {}, [[{ id: "c", label: "C" }]]);
  assert.equal(merged, '[\n  {"id":"c","label":"C"}\n]\n');
  assert.equal(oakMergeJson(merged, {}, [[{ id: "c", label: "C" }]]), merged, "merging again changes nothing");
  assert.deepEqual(JSON.parse(oakMergeJson(merged, {}, [[{ id: "c", label: "C2" }]])).at(-1), { id: "c", label: "C2" }, "an edited fragment replaces its entry");
});

test("fragments: a keyed list and an object map merge the same way, in each file's own style", () => {
  const sets = oakMergeJson(pretty, { key: "sets" }, [[{ id: "b", claims: [] }]]);
  assert.deepEqual(JSON.parse(sets).sets.map(set => set.id), ["b"]);
  assert.match(sets, /\n  \{\n   "id": "b",\n   "claims": \[\]\n  \}\n \]/, "a pretty list stays pretty at its own indent");
  const map = oakMergeJson(assets, { key: "states" }, [{ c: { asset: "y" } }]);
  assert.deepEqual(Object.keys(JSON.parse(map).states), ["c"]);
  assert.equal(JSON.parse(map).assets.constructor, Object);
});

test("fragments: an id two fragments both define fails", () => {
  assert.throws(() => oakMergeJson(states, {}, [[{ id: "c" }], [{ id: "c" }]]), /c/);
});
