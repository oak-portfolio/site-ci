import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { advanceOakSettle, readOakSettle, settleOakAfterFallback, subscribeOakSettle, OAK_SETTLE_FALLBACK_MS } from "../../../src/lib/openui/settlePhase.ts";

// Ticket 152: one module holds a planned turn's settle phase; OakTurn advances it and the transcript reads it.
const replay = (id, events) => {
  const seen = [];
  const stop = subscribeOakSettle(() => seen.push(readOakSettle(id).phase));
  for (const [event, held] of events) advanceOakSettle(id, event, held);
  stop();
  return seen;
};

test("settle phase: a planned turn goes live, commits, folds held, then settles at the fold's end", () => {
  const id = "planned";
  assert.equal(readOakSettle(id).phase, "settled", "a turn the module never heard of is at rest");
  const seen = replay(id, [["pending", false], ["pending", false], ["complete", true]]);
  assert.deepEqual(seen, ["live", "committing"], "the answer landing while pending keeps the turn live");
  assert.deepEqual(readOakSettle(id), { phase: "committing", held: true });
  assert.deepEqual(replay(id, [["fold", true]]), ["folding"]);
  assert.deepEqual(readOakSettle(id), { phase: "folding", held: true });
  assert.deepEqual(replay(id, [["complete", true], ["fold-end", false]]), ["settled"], "a late report never moves a phase back");
  assert.deepEqual(readOakSettle(id), { phase: "settled", held: false });
});

test("settle phase: an unplanned fold settles as it starts, and a new pending turn starts over", () => {
  const id = "unplanned";
  assert.deepEqual(replay(id, [["pending", false], ["complete", false], ["fold", false]]), ["live", "committing", "settled"]);
  assert.deepEqual(replay(id, [["pending", false]]), ["live"]);
});

test("settle phase: a visitor's own toggle mid-fold drops the hold and settles the turn", () => {
  const id = "touched";
  replay(id, [["pending", false], ["complete", true], ["fold", true]]);
  assert.deepEqual(replay(id, [["fold", false]]), ["settled"]);
});

test("settle phase: a fold that never reports its end settles after the 2,500 ms fallback", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    assert.equal(OAK_SETTLE_FALLBACK_MS, 2500);
    const id = "stuck";
    replay(id, [["pending", false], ["complete", true], ["fold", true]]);
    settleOakAfterFallback(id);
    mock.timers.tick(OAK_SETTLE_FALLBACK_MS - 1);
    assert.equal(readOakSettle(id).phase, "folding");
    mock.timers.tick(1);
    assert.deepEqual(readOakSettle(id), { phase: "settled", held: false });

    const cancelled = "cancelled";
    replay(cancelled, [["pending", false], ["complete", false]]);
    settleOakAfterFallback(cancelled)();
    mock.timers.tick(OAK_SETTLE_FALLBACK_MS);
    assert.equal(readOakSettle(cancelled).phase, "committing", "a cancelled fallback leaves the phase alone");

    const live = "live";
    replay(live, [["pending", false]]);
    settleOakAfterFallback(live);
    mock.timers.tick(OAK_SETTLE_FALLBACK_MS);
    assert.equal(readOakSettle(live).phase, "live", "the fallback never ends a turn still running");
  } finally {
    mock.timers.reset();
  }
});
