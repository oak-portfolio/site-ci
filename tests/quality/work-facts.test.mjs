// Tickets 285 and 310: the card and record facts the quality bar reads, generated so the eval's workerd pool needs no disk read.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { oakCardFactsJson, oakRecordFactsJson } from "../../scripts/openui/build-prompt.mjs";

const committed = name => readFileSync(new URL(`../../src/data/generated/${name}`, import.meta.url), "utf8");

test("work facts: the committed card-facts.json and record-facts.json match every Work page's front matter (npm run openui:prompt)", () => {
  assert.equal(committed("card-facts.json"), oakCardFactsJson());
  assert.equal(committed("record-facts.json"), oakRecordFactsJson());
});

test("work facts: a page keeps its systemMap, articleStatus and card title", () => {
  const brain = JSON.parse(oakRecordFactsJson())["work:agentic-brain"];
  assert.ok(brain.systemMap.length > 0 && brain.systemMap.every(step => step.label && step.description));
  assert.equal(brain.articleStatus, "in-progress-stub");
  assert.equal(JSON.parse(oakCardFactsJson())["https://steveoak.com/work/agentic-brain"].title, "Agentic Brain");
});
