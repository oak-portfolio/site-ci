import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createLoader, loadTsx, stubSets } from "../design-rework/load-tsx.mjs";
import { oakOpenUIGenerated } from "../../../scripts/openui/build-prompt.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { oakOpenUIParse, oakOpenUIVerdict } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const states = JSON.parse(readFileSync("src/data/dev/oak-states.json", "utf8"));
const list = Array.isArray(states) ? states : states.states;

// Ticket 238: the render parser takes a flagged block's optional argument while its constant still ships false.
for (const id of ["callout-held", "heading-chip", "kind-decisions"]) test(`flagged args: ${id} parses with the flags as shipped`, () => {
  const message = list.find(state => state.id === id).workspace.messages.at(-1);
  const program = message.ui.program;
  const parsed = oakOpenUIParse(program);
  assert.equal(oakOpenUIVerdict(program, parsed, message.answer.claims.map(claim => claim.id)), null, JSON.stringify(parsed.meta?.errors ?? parsed.errors));
});

const dir = "packages/oak-agent-contracts/src/openui/";
const hash = text => createHash("sha256").update(text).digest("hex");
const live = oakOpenUIGenerated(loadTsx("src/lib/openui.tsx"));

test("flagged args: spec.json and system-prompt.ts hash the same at the base, the head and as generated now", t => {
  let base;
  try { base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return t.skip("no origin/main to compare"); }
  for (const file of ["spec.json", "system-prompt.ts"]) {
    const atBase = execFileSync("git", ["show", `${base}:${dir}${file}`], { encoding: "utf8", maxBuffer: 1 << 26 });
    assert.equal(hash(readFileSync(`${dir}${file}`, "utf8")), hash(atBase), `${file} at the head`);
    assert.equal(hash(live[file]), hash(atBase), `${file} generated now`);
  }
});

const FLAGS = [
  { module: "@/lib/oakFlags/calloutKinds", name: "oakCalloutKinds", component: "Callout", arg: "kind" },
  { module: "@/lib/oakFlags/headingChip", name: "oakHeadingChip", component: "Heading", arg: "from" },
  { module: "@/lib/oakFlags/kindDecisions", name: "oakKindDecisions", component: "Points", arg: "mode" },
];
for (const { module, name, component, arg } of FLAGS) test(`flagged args: with ${name} forced on, the prompt teaches ${component}(${arg})`, () => {
  const flag = loadTsx(`src/lib/oakFlags/${module.split("/").at(-1)}.ts`);
  const load = createLoader({ use: [stubSets.icons], interop: true, stubs: { [module]: { ...flag, [name]: true, [`${name}On`]: () => true } } });
  const generated = oakOpenUIGenerated(load("src/lib/openui.tsx"));
  const prompt = JSON.parse(generated["system-prompt.ts"].match(/= (".*");\n$/s)[1]);
  assert.match(prompt, new RegExp(`\\b${component}\\([^)]*\\b${arg}\\?`), "the system prompt");
  assert.ok(arg in JSON.parse(generated["spec.json"]).schema.$defs[component].properties, "spec.json");
  assert.doesNotMatch(JSON.parse(live["system-prompt.ts"].match(/= (".*");\n$/s)[1]), new RegExp(`\\b${component}\\([^)]*\\b${arg}\\?`), "as shipped, the prompt leaves it out");
});
