import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

test("gallery fixtures cover every required state with unique ids and resolvable answer references", async () => {
  const states = await read("src/data/dev/oak-states.json");
  const answers = new Set((await read("tests/agent/work-answers.v1.json")).fixtures.map((fixture) => fixture.id));
  const required = await read("tests/agent/design-rework/fixtures/required-gallery-states.json");
  const ids = states.map((state) => state.id);
  assert.equal(new Set(ids).size, ids.length, "state ids are unique");
  assert.deepEqual(required.filter((id) => !ids.includes(id)), []);
  const references = JSON.stringify(states).matchAll(/"(?:ask|answer|evidenceFrom)":"([^"]+)"/g);
  for (const [, id] of references) assert(answers.has(id), `answer fixture ${id} exists`);
});
