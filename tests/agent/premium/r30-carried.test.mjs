import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState, stateById } from "./gallery.mjs";

// R30 carried answer defects (R29 capture judge, live-v48). Both gallery states are copied from the live answers.
const program = await import("../../../packages/oak-agent-contracts/src/openui/program.ts");
const verdict = await import("../../../packages/oak-agent-contracts/src/openui/verdict.ts");

const answerOf = id => stateById(id).workspace.messages.at(-1);
const withBrowser = async run => {
  const browser = await chromium.launch();
  try { return await run(await browser.newPage({ viewport: { width: 1280, height: 800 } })); } finally { await browser.close(); }
};

// The layout the arranger sent for the live LinkedIn answer: all six claims in one numbered list, nothing written above it.
const liveSteps = 'root = Answer([how, src, next])\nhow = Steps(["claim-1", "claim-2", "claim-3", "claim-4", "claim-5", "claim-6"])\nsrc = Sources()\n'
  + 'next = Pills(["How did the agents self-improve?", "What tools and stack did he use?"])';
const claimIds = [1, 2, 3, 4, 5, 6].map(n => `claim-${n}`);
const question = "What steps did Steve take to build the LinkedIn Growth Loop?";

test("Q25-G29 and review E M5: a steps list leads with an overview, never with its own step 1", () => {
  // The live claim 1 cites one page, so it is a real step: the list stays whole and the app's framing line leads it.
  const kept = program.oakLayoutSettle(program.oakLayoutParse(liveSteps), { claimIds, question, overview: null });
  assert.equal(kept.moves.includes("lead-first"), false, `moves ${kept.moves}`);
  assert.equal(program.oakLayoutPrint(kept.program), answerOf("answer-openui-steps-linkedin").ui.program);
  assert.equal(verdict.oakOpenUIIntro(program.oakLayoutPrint(kept.program).match(/^\w+ = (\w+)\(/gm).map(line => line.split(" = ")[1].slice(0, -1)).slice(1)),
    "The steps, in order, as Steve's pages describe them:");
  assert.equal(verdict.oakOpenUILeadStream(liveSteps, null), liveSteps);
  // A claim 1 that is the answer's overview leads as a sentence above the rest of the list.
  const led = program.oakLayoutSettle(program.oakLayoutParse(liveSteps), { claimIds, question, overview: "claim-1" });
  assert.ok(led.moves.includes("lead-first"), `moves ${led.moves}`);
  const root = led.program.statements.find(value => value.name === "root").body;
  const first = root.match(/\[\s*(\w+)/)[1];
  assert.deepEqual(led.program.statements.find(value => value.name === first), { name: first, component: "Prose", body: '"claim-1"' });
  assert.equal(program.oakLayoutCovers(led.program, claimIds), true);
  // Fewer than three claims is left alone.
  const short = program.oakLayoutParse('root = Answer([how])\nhow = Steps(["claim-1", "claim-2"])');
  assert.equal(program.oakLayoutLeadFirst(short, ["claim-1", "claim-2"], null), short);
});

test("Q25-G29 review E M4: two short lists the settle joins open under a written line", () => {
  const ids = ["claim-1", "claim-2", "claim-3", "claim-4"];
  const two = 'root = Answer([a, b, src])\na = Steps(["claim-1", "claim-2"])\nb = Steps(["claim-3", "claim-4"])\nsrc = Sources()';
  const kinds = settled => settled.program.statements.find(value => value.name === "root").body.match(/\w+/g)
    .map(name => settled.program.statements.find(value => value.name === name)?.component);
  const plain = program.oakLayoutSettle(program.oakLayoutParse(two), { claimIds: ids, question: "What steps did Steve take to ship it?", overview: null });
  assert.ok(plain.moves.includes("steps-joined"), `moves ${plain.moves}`);
  assert.equal(verdict.oakOpenUIIntro(kinds(plain)), "The steps, in order, as Steve's pages describe them:");
  const led = program.oakLayoutSettle(program.oakLayoutParse(two), { claimIds: ids, question: "What steps did Steve take to ship it?", overview: "claim-1" });
  assert.equal(kinds(led)[0], "Prose");
  assert.equal(program.oakLayoutCovers(led.program, ids), true);
});

test("Q25-G29 the live steps answer opens on a sentence, then a numbered list that starts at 1", async () => {
  await withBrowser(async page => {
    await openState(page, "answer-openui-steps-linkedin", { settle: 300 });
    const shape = await page.evaluate(() => {
      const root = document.querySelector(".oak-openui");
      const blocks = [...root.children].filter(node => !node.matches(".oak-openui__heading"));
      const lead = blocks[0], list = root.querySelector("ol.oak-openui__steps");
      return { leadIsProse: lead.matches("p.oak-openui__prose"), leadWords: lead.textContent.trim().split(/\s+/).length,
        leadBeforeList: Boolean(lead.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING),
        steps: list.querySelectorAll(":scope > li").length, start: list.getAttribute("start") };
    });
    assert.equal(shape.leadIsProse, true, "the answer opens on the numbered list");
    assert.ok(shape.leadWords >= 8, `lead is ${shape.leadWords} words`);
    assert.equal(shape.leadBeforeList, true);
    assert.equal(shape.steps, 6);
    assert.equal(shape.start, null);
  });
});

const chipsProbe = () => {
  const text = node => node.textContent.trim();
  return { chips: [...document.querySelectorAll(".oak-openui-chips:not(.oak-openui-role__titles) li")].map(text),
    tiles: [...document.querySelectorAll(".oak-openui-card__metrics dt")].map(text),
    cards: document.querySelectorAll(".oak-openui-project").length };
};

test("Q25-G30 review E M3: only a question about the tools Steve uses is a tools question", () => {
  for (const asked of ["What tech stack does Steve use?", "Which frameworks does Steve use?", "What's Steve's tech stack?",
    "What tools and stack did he use?", "What languages does Steve code in?", "What stack did Steve build Oakminder with?"])
    assert.equal(verdict.oakOpenUIToolsQuestion(asked), true, asked);
  for (const asked of ["What tools has Steve built?", "Which full-stack projects has Steve shipped?", "How does Steve stack up against other engineers?",
    "What technology problems has Steve solved?", "What results did Steve get with his tech stack?", "What has Steve built?"])
    assert.equal(verdict.oakOpenUIToolsQuestion(asked), false, asked);
});

test("Q25-G30 a stack answer shows each tool once and no tile that is not a tool", async () => {
  await withBrowser(async page => {
    await openState(page, "answer-openui-stack", { settle: 300 });
    const { chips, tiles, cards } = await page.evaluate(chipsProbe);
    assert.equal(cards, 2, "the two project cards still show");
    const folded = chips.map(chip => chip.toLowerCase());
    assert.deepEqual(folded.filter((chip, at) => folded.indexOf(chip) !== at), [], `repeated tools: ${chips.join(", ")}`);
    assert.deepEqual(tiles, [], `tiles that are not tools: ${tiles.join(", ")}`);
    assert.ok(chips.length >= 8, `the tool list stays: ${chips.length} chips`);
    for (const tool of ["Expo", "Convex", "Clerk", "Next.js"]) assert.ok(chips.includes(tool), `${tool} is listed once`);
  });
});

test("Q25-G30 a projects question keeps its card tiles and tools", async () => {
  await withBrowser(async page => {
    await openState(page, "answer-openui-projects", { settle: 300 });
    const before = await page.evaluate(chipsProbe);
    assert.ok(before.cards >= 2);
    // Cards of a projects answer are unchanged by the stack rule: whatever tiles and chips they carry still show.
    assert.ok(before.chips.length + before.tiles.length > 0);
  });
});
