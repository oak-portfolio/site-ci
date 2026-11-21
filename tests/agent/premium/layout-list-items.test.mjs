import { test } from "node:test";
import assert from "node:assert/strict";

const { oakLayoutCovers, oakLayoutDropRepeats, oakLayoutParse, oakLayoutPlaceMissing, oakLayoutPrint } =
  await import("../../../packages/oak-agent-contracts/src/openui/program.ts");

const parse = text => oakLayoutParse(text);
const ids = ["claim-1", "claim-2", "claim-3"];

test("a follow-up question with a comma keeps its text when a missing claim is placed", () => {
  const program = parse('root = Answer([a, Pills(["C,C++?"]), src])\na = Prose("claim-1")\nsrc = Sources()');
  const placed = oakLayoutPlaceMissing(program, ["claim-1", "claim-2"]);
  assert.ok(placed, "the missing claim is placed");
  assert.match(oakLayoutPrint(placed), /Pills\(\["C,C\+\+\?"\]\)/);
});

test("a repeat claim's Meter inside an inline Stats leaves the list with no dangling name", () => {
  const program = parse('root = Answer([a, Stats([m3, m4]), src])\na = Prose("claim-1")\nm3 = Metric("L", "3", "claim-3")\nm4 = Meter("M", 4, "claim-3")\nsrc = Sources()');
  const dropped = oakLayoutDropRepeats(program);
  const root = dropped.statements.find(value => value.name === "root");
  assert.equal(root.body, "[a, Stats([m3]), src]");
  assert.ok(!dropped.statements.some(value => value.name === "m4"), "the repeat Meter is gone");
  const placed = oakLayoutPlaceMissing(program, ids);
  assert.ok(placed && !/\bm4\b/.test(oakLayoutPrint(placed)), "the settled program names no m4");
});

test("the coverage check rejects a listed name nothing defines and accepts it once defined", () => {
  const base = 'root = Answer([a, ghost, src])\na = Prose("claim-1")\nsrc = Sources()';
  assert.equal(oakLayoutCovers(parse(base), ["claim-1"]), false);
  assert.equal(oakLayoutCovers(parse(`${base}\nghost = Prose("claim-2")`), ["claim-1", "claim-2"]), true);
  assert.equal(oakLayoutCovers(parse('root = Answer([a, Stats([m3, m4]), src])\na = Prose("claim-1")\nm3 = Metric("L", "3", "claim-3")\nsrc = Sources()'), ["claim-1", "claim-3"]), false);
});

test("inline lists are read two levels deep", () => {
  const program = parse('root = Answer([a, Group([Stats([m3, m4]), b]), src])\na = Prose("claim-1")\nb = Prose("claim-2")\nm3 = Metric("L", "3", "claim-3")\nm4 = Meter("M", 4, "claim-3")\nsrc = Sources()');
  const root = oakLayoutDropRepeats(program).statements.find(value => value.name === "root");
  assert.equal(root.body, "[a, Group([Stats([m3]), b]), src]");
  assert.equal(oakLayoutCovers(parse('root = Answer([a, Group([Stats([m3, ghost])]), src])\na = Prose("claim-1")\nm3 = Metric("L", "3", "claim-3")\nsrc = Sources()'), ["claim-1", "claim-3"]), false);
});
