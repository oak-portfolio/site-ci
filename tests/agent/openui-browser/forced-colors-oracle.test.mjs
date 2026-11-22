import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { judgeCue, judgeFocus } from "./forced-colors-oracle.mjs";

// Ticket 201: the forced-colors oracle on pages broken on purpose, one per hole a 196 review found, plus one clean page.
const BROKEN = [
  { page: "mark-transparent-fill", cue: { block: "dot", marks: ".dot" }, says: "paint like the canvas" },
  { page: "before-transparent-white", cue: { block: "ring", marks: ".ring" }, says: "paint like the canvas" },
  { page: "icon-hidden", cue: { block: "icon", marks: ".icon" }, says: "paint like the canvas" },
  { page: "canvas-fill-dot", cue: { block: "dot", marks: ".dot" }, says: "paint like the canvas" },
  { page: "tinted-transparent-dot", cue: { block: "dot", marks: ".dot" }, says: "paint like the canvas" },
  { page: "focus-ring-canvas", focus: { block: "chip", target: ".chip" }, says: "under 3:1" },
  { page: "focus-outline-none", focus: { block: "chip", target: ".chip" }, says: "draws a focus outline" },
  { page: "focus-ring-faint", focus: { block: "chip", target: ".chip" }, says: "under 3:1" },
];

const CLEAN = {
  cues: [
    { block: "dot", marks: ".dot", text: "p" },
    { block: "ring", marks: ".ring" },
    { block: "icon", marks: ".icon" },
    { block: "tabs", on: ".tab[aria-pressed=true]", off: ".tab[aria-pressed=false]" },
  ],
  focus: [{ block: "chip", target: ".chip" }],
};

let browser;
before(async () => { browser = await chromium.launch(); });
after(() => browser?.close());

const open = async name => {
  const context = await browser.newContext({ viewport: { width: 390, height: 600 }, forcedColors: "active", colorScheme: "light" });
  const page = await context.newPage();
  await page.goto(new URL(`./forced-colors-fixtures/${name}.html`, import.meta.url).href);
  assert.ok(await page.evaluate(() => matchMedia("(forced-colors: active)").matches), "forced colors is emulated");
  return { context, page };
};

for (const broken of BROKEN) {
  test(`forced-colors oracle flags ${broken.page}`, async () => {
    const { context, page } = await open(broken.page);
    try {
      const problems = broken.cue ? await judgeCue(page, broken.cue) : await judgeFocus(page, broken.focus);
      assert.ok(problems.some(problem => problem.includes(broken.says)), `expected "${broken.says}", got ${JSON.stringify(problems)}`);
    } finally { await context.close(); }
  });
}

test("forced-colors oracle passes the clean page", async () => {
  const { context, page } = await open("clean");
  try {
    for (const cue of CLEAN.cues) assert.deepEqual(await judgeCue(page, cue), [], cue.block);
    for (const cue of CLEAN.focus) assert.deepEqual(await judgeFocus(page, cue), [], cue.block);
  } finally { await context.close(); }
});
