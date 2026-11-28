import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx } from "../design-rework/load-tsx.mjs";

const { oakGhostRows } = loadTsx("src/lib/openui/ghostRows.tsx");

const plan = [{ kind: "Prose", count: 1 }, { kind: "Points", count: 3 }, { kind: "Steps", count: 2 }];
const claimsOf = rows => rows.map(row => [row.ghost.kind, row.claims, Boolean(row.ghost.folding)]);

test("ghost rows: with nothing drawn each planned block sizes from the unplaced claims in answer order", () => {
  const rows = oakGhostRows({ plan, drawn: [], unplaced: ["a", "b", "c", "d", "e", "f"], held: [], released: false });
  assert.deepEqual(claimsOf(rows), [["Prose", ["a"], false], ["Points", ["b", "c", "d"], false], ["Steps", ["e", "f"], false]]);
});

test("ghost rows (107 r3): a row keeps the claim it was first sized by while another block fills", () => {
  const first = oakGhostRows({ plan, drawn: [], unplaced: ["a", "b", "c", "d", "e", "f"], held: [], released: false });
  const filled = oakGhostRows({ plan, drawn: ["Prose", "Points"], unplaced: [], held: first, released: false });
  assert.deepEqual(claimsOf(filled), [["Steps", ["e", "f"], false]]);
});

test("ghost rows (107 r3): a row with fewer claims of its own tops up from what it held, then from the claims still unplaced", () => {
  const held = [{ ghost: { kind: "Steps", count: 2, at: 2, folding: false }, claims: ["e", "f"] }];
  const rows = oakGhostRows({ plan, drawn: ["Prose", "Points"], unplaced: ["x"], held, released: false });
  assert.deepEqual(claimsOf(rows), [["Steps", ["x", "f"], false]]);
  const fresh = oakGhostRows({ plan, drawn: ["Prose", "Points"], unplaced: ["x"], held: [], released: false });
  assert.deepEqual(claimsOf(fresh), [["Steps", ["x", "x"], false]]);
});

test("ghost rows: a folding row keeps the claims it held, as a dropped block's claims are placed elsewhere", () => {
  const held = oakGhostRows({ plan, drawn: [], unplaced: ["a", "b", "c", "d", "e", "f"], held: [], released: false });
  const rows = oakGhostRows({ plan, drawn: ["Prose", "Steps"], unplaced: [], held, released: false });
  assert.deepEqual(claimsOf(rows), [["Points", ["b", "c", "d"], true]]);
});

test("ghost rows (119): when the plan ends, open and folding rows stay folding until released, then the list is empty", () => {
  const held = [
    { ghost: { kind: "Points", count: 3, at: 1, folding: true }, claims: ["b", "c", "d"] },
    { ghost: { kind: "Steps", count: 2, at: 2, folding: false }, claims: ["e", "f"] },
  ];
  const ended = oakGhostRows({ plan: null, drawn: ["Prose"], unplaced: [], held, released: false });
  assert.deepEqual(claimsOf(ended), [["Points", ["b", "c", "d"], true], ["Steps", ["e", "f"], true]]);
  assert.equal(held[1].ghost.folding, false);
  assert.deepEqual(oakGhostRows({ plan: null, drawn: ["Prose"], unplaced: [], held, released: true }), []);
});
