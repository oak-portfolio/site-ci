import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { answerStates, galleryStates, openState, stateById, stateIds } from "./gallery.mjs";

// ARCH@35: the gallery module is the one place the premium probes learn which states exist and how to open them.
test("ARCH@35 the gallery module lists states from the parsed file, not from line matches", async () => {
  const ids = galleryStates.map(state => state.id);
  assert.equal(new Set(ids).size, ids.length, "state ids are unique");
  assert.deepEqual(stateIds(), ids);
  const answers = answerStates();
  assert.ok(answers.length >= 15 && answers.includes("role-fit-answer") && answers.every(id => ids.includes(id)));
  // The old line match for work-link states saw only states whose id and link shared a line.
  const text = readFileSync("src/data/dev/oak-states.json", "utf8");
  const lineMatched = text.split("\n").filter(line => line.includes("steveoak.com/work")).map(line => line.match(/"id": "([^"]+)"/)?.[1]).filter(Boolean);
  const parsed = stateIds(state => JSON.stringify(state).includes("steveoak.com/work"));
  assert.ok(lineMatched.every(id => parsed.includes(id)) && parsed.length >= lineMatched.length);
  assert.throws(() => stateById("no-such-state"), /no gallery state "no-such-state"/);
  await assert.rejects(openState({ goto: () => assert.fail("must not navigate") }, "no-such-state"), /no gallery state/);
});
