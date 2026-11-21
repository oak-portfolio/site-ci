import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { oakRenderLibrary } = loadTsx("src/lib/openui.tsx");
const { OakArrangedAnswer, oakOpenUIParse, oakOpenUIVerdict } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");

/**
 * Stored answer programs: a frozen snapshot of the dev gallery's settled OpenUI answers, never regenerated. They are
 * hand-written fixtures in the saved-program shape, not programs exported from real visitor chats, so they guard component
 * names and positional props rather than every shape the Worker has emitted. A view changed under an old component name
 * must still draw every program, place every claim and stay out of the plain-answer fallback.
 */
const stored = JSON.parse(readFileSync(new URL("./stored-openui-programs.json", import.meta.url), "utf8"));
// The site builds the facts file for its current revision only, so a stored answer's own revision answers 404 and its
// facts settle as missing. A block that draws from record facts then falls back to its plain form, with every claim.
for (const revision of new Set(stored.map(item => item.answer.knowledgeRevision))) primeOakRecordFacts(revision, null);
const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", operations: ["search", "read"] };
const render = (item) => renderToStaticMarkup(createElement(OakArrangedAnswer, {
  id: item.id, answer: { ...base, ...item.answer }, ui: { status: "done", program: item.program }, question: item.question, latest: false,
}));
// A block's view loads in its own chunk: one render starts each import, and the tests read the settled views.
for (const item of stored) render(item);
await new Promise(resolve => setTimeout(resolve, 50));
const componentsIn = (program) => [...program.matchAll(/^\s*\w+\s*=\s*([A-Z]\w*)\(/gm)].map(match => match[1]);
// A claim's checked text, as Q17 reads it: the first 40 characters are enough to find it on screen.
const claimShown = (html, claim) => html.includes(claim.text.slice(0, 40).replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;"));

test("stored programs: every shipped component is covered, with both from and also", () => {
  const shipped = Object.keys(oakRenderLibrary.toJSONSchema().$defs ?? {}).sort();
  assert.ok(shipped.length >= 20, `the library lists its components (${shipped.length})`);
  const covered = new Set(stored.flatMap(item => componentsIn(item.program)));
  const missing = shipped.filter(name => !covered.has(name));
  console.log(`openui stored programs: ${stored.length} programs cover ${covered.size} of ${shipped.length} components (${[...covered].sort().join(", ")})`);
  assert.deepEqual(missing, [], `components with no stored program: ${missing.join(", ")}`);
  assert.ok(stored.some(item => /Steps\(\[[^\]]*\],\s*\d+\)/.test(item.program)), "a stored program uses Steps from");
  assert.ok(stored.some(item => /CompareRow\("[^"]*",\s*"claim-\d+",\s*"claim-\d+"\)/.test(item.program)), "a stored program uses CompareRow also");
});

for (const item of stored) {
  test(`stored program ${item.id} renders as a layout and shows every claim`, () => {
    const claimIds = item.answer.claims.map(claim => claim.id);
    assert.equal(oakOpenUIVerdict(item.program, oakOpenUIParse(item.program), claimIds), null, "the program parses and places every claim");
    const html = render(item);
    assert.match(html, /class="oak-openui-answer"/, "the layout draws, not the plain answer");
    assert.match(html, /class="oak-openui"/);
    for (const claim of item.answer.claims) assert.ok(claimShown(html, claim), `${claim.id} is on screen`);
  });
}

test("stored programs: a program that leaves a claim out still falls back to the plain answer", () => {
  const item = { ...stored.find(entry => entry.id === "answer-openui-settled"), program: 'root = Answer([p, src])\np = Prose("claim-1")\nsrc = Sources()' };
  assert.doesNotMatch(render(item), /class="oak-openui-answer"/);
});
