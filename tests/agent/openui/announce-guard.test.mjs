import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { announceOakBlock, subscribeOakBlockAnnouncements } from "../../../src/lib/openui/a11y/oakBlockAnnounce.ts";

// Ticket 153: blocks speak through announceOakBlock and the transcript's one polite region, never a live region of their own.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../src");
const root = path.join(src, "lib/openui");
const agent = path.join(src, "components/agent");
const LIVE = /aria-live|role=["']status["']|role:\s*["']status["']/;
// A modal dialog marks the transcript inert, its shared region with it, so a notice raised inside the dialog keeps one region there (143).
const MODAL = ["OakContactCard.tsx"];
const liveLines = (dir, file) => readFileSync(path.join(dir, file), "utf8").split("\n").flatMap((line, at) => LIVE.test(line) ? [`${file}:${at + 1}`] : []);

// Ticket 166: every src/components/agent file an answer draws, found by following imports from OakOpenUIAnswer.tsx.
function answerFiles(file = "OakOpenUIAnswer.tsx", seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const [, name] of readFileSync(path.join(agent, file), "utf8").matchAll(/(?:from\s+|import\(\s*)["'](?:\.\/|@\/components\/agent\/)([\w.-]+)["']/g)) {
    const next = [".tsx", ".ts"].map(ext => name.replace(/\.tsx?$/, "") + ext).find(candidate => existsSync(path.join(agent, candidate)));
    if (next) answerFiles(next, seen);
  }
  return seen;
}

test("guard: no aria-live or role=\"status\" under src/lib/openui outside a11y/", () => {
  const hits = readdirSync(root, { recursive: true }).filter(file => /\.(tsx?|jsx?)$/.test(file) && !file.startsWith(`a11y${path.sep}`))
    .flatMap(file => liveLines(root, file));
  assert.deepEqual(hits, [], "announce through announceOakBlock instead");
});

test("guard: no aria-live or role=\"status\" in any src/components/agent file an answer draws", () => {
  const files = [...answerFiles()];
  assert.ok(files.includes("OakContactCard.tsx"), "the walk reaches the answer blocks");
  assert.deepEqual(files.filter(file => !MODAL.includes(file)).flatMap(file => liveLines(agent, file)), [], "announce through announceOakBlock instead");
  for (const file of MODAL) assert.equal(liveLines(agent, file).length, 1, `${file} keeps exactly one region, inside its modal dialog`);
});

test("announceOakBlock: the same block and text is said once, and repeat: true is always heard", () => {
  const heard = [];
  const stop = subscribeOakBlockAnnouncements(text => heard.push(text));
  try {
    announceOakBlock("guard:once", "Said once.");
    announceOakBlock("guard:once", "Said once.");
    announceOakBlock("guard:again", "Said twice.", { repeat: true });
    announceOakBlock("guard:again", "Said twice.", { repeat: true });
    assert.deepEqual(heard, ["Said once.", "Said twice.", "Said twice."]);
  } finally { stop(); }
});
