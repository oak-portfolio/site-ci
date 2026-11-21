import assert from "node:assert/strict";
import { test } from "node:test";
import { componentHealth } from "../../scripts/quality/live-health-core.mjs";

// Ticket 08 (ARCH-REVIEW A12): `live-health.mjs --components` reads each Arrange run's `openui` metadata, so ticket 37's 24-hour
// bar can name every taught component.
const arrange = (trace_id, openui) => ({ id: `${trace_id}-arrange`, trace_id, extra: { metadata: openui ? { openui } : {} } });

test("--components turns Arrange runs into picks, fallbacks and byte cuts per component", () => {
  const health = componentHealth([
    arrange("a", { outcome: "done", components: ["Answer", "Prose", "Steps", "Sources"] }),
    arrange("b", { outcome: "done", components: ["Answer", "Project", "Stack", "Sources"], led: true }),
    arrange("c", { outcome: "done", components: ["Answer", "Steps", "Steps"], reason: "placed-missing" }),
    arrange("d", { outcome: "fallback", components: [], reason: "size" }),
    arrange("e", { outcome: "fallback", components: [], reason: "coverage" }),
    arrange("f", { outcome: "fallback", components: ["Answer", "Board"], reason: "size" }),
    arrange("g"),
  ]);
  assert.equal(health.arranged, 7);
  assert.deepEqual(health.components, {
    Answer: { picks: 3, fallbacks: 1, byteCuts: 1 }, Prose: { picks: 1, fallbacks: 0, byteCuts: 0 }, Steps: { picks: 2, fallbacks: 0, byteCuts: 0 },
    Sources: { picks: 2, fallbacks: 0, byteCuts: 0 }, Project: { picks: 1, fallbacks: 0, byteCuts: 0 }, Stack: { picks: 1, fallbacks: 0, byteCuts: 0 },
    Board: { picks: 0, fallbacks: 1, byteCuts: 1 },
  });
  assert.deepEqual(health.unattributed, { fallbacks: 2, byteCuts: 1 }, "a fallback that names no component is counted once, unattributed");
  assert.equal(health.unrecorded, 1, "a run without openui metadata is neither a pick nor a fallback");
});

test("--components on no runs is empty", () => {
  assert.deepEqual(componentHealth([]), { arranged: 0, components: {}, unattributed: { fallbacks: 0, byteCuts: 0 }, unrecorded: 0 });
});
