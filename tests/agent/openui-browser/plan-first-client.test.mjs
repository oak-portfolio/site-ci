import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { launchSlowLazy } from "../support/slow-lazy.mjs";
import { createLoader, loadTsx, stubSets } from "../design-rework/load-tsx.mjs";
import { openState, stateById } from "../premium/gallery.mjs";

// Ticket 17 (plan-first, client): a strict, id-checked data-plan part draws one ghost per planned block behind oakPlanFirst.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { parseOakOutput } = loadTsx("src/lib/oakWorkspaceTransport.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { OakChainOfThought } = loadTsx("src/components/agent/OakChainOfThought.tsx");
const planFirst = loadTsx("src/lib/oakFlags/planFirst.ts");

const requestId = "00000000-0000-4000-8000-0000000000a1";
const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: ["search", "read"] };
const citation = { documentId: "work:oakminder", passageId: "work:oakminder:passage-001", sectionId: "work:oakminder", url: "https://steveoak.com/work/oakminder/" };
const answer = { ...base, kind: "sourced", acknowledgment: null, claims: [1, 2, 3, 4].map(n => ({ id: `claim-${n}`, text: `Claim ${n} about Oakminder.`, citations: [citation] })) };
const plan = { blocks: [{ kind: "Prose", count: 1 }, { kind: "Project", count: 1 }, { kind: "Steps", count: 3 }] };
const part = (data, id = `${requestId}:plan`) => ({ type: "data-plan", id, data });

test("transport: an old payload and one with a data-plan both parse, and only the second carries the plan", () => {
  const old = parseOakOutput([{ type: "data-answer", data: answer }], requestId);
  assert.deepEqual(old.answer, answer);
  assert.equal("plan" in old, false, "an old payload has no plan");
  const planned = parseOakOutput([part(plan), { type: "data-answer", data: answer }], requestId);
  assert.deepEqual(planned.answer, answer);
  assert.deepEqual(planned.plan, plan);
});

test("transport: a data-plan with a wrong id, or one that breaks the schema, drops only the plan and the turn still answers", () => {
  for (const bad of [part(plan, "someone-else:plan"), part(plan, requestId), { type: "data-plan", data: plan },
    part({ blocks: [{ kind: "Prose", count: 1, text: "leak" }, { kind: "Project", count: 1 }] }), part({ blocks: [{ kind: "Project", count: 1 }, { kind: "Prose", count: 1 }] })]) {
    const output = parseOakOutput([bad, { type: "data-answer", data: answer }], requestId);
    assert.deepEqual(output.answer, answer, "the answer still parses");
    assert.equal("plan" in output, false, `rejected: ${JSON.stringify(bad).slice(0, 80)}`);
  }
});

const streaming = program => ({ requestId, program, status: "streaming" });
const lead = 'root = Answer([lead, card, how])\nlead = Prose("claim-1")\n';
const render = ({ ui = null, pending = true, on = true, blocks = plan.blocks } = {}) => {
  planFirst.forceOakPlanFirst(on);
  try {
    return renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer, ui, plan: { blocks }, pending, question: "How was Oakminder built?", latest: true }));
  } finally { planFirst.forceOakPlanFirst(null); }
};
const ghosts = html => [...html.matchAll(/data-ghost="(\w+)"(?: data-fold="")?/g)].map(([whole, kind]) => whole.includes("data-fold") ? `${kind}:fold` : kind);

test("constant: with oakPlanFirst forced off nothing renders from the plan", () => {
  assert.deepEqual(ghosts(render({ on: false })), []);
  assert.doesNotMatch(render({ on: false }), /oak-openui-ghosts/);
  assert.deepEqual(ghosts(render({ on: false, ui: streaming(lead) })), []);
});

test("plan, no program: the lead slot then one aria-hidden ghost per planned block, in plan order", () => {
  const html = render();
  assert.deepEqual(ghosts(html), ["Prose", "Project", "Steps"]);
  assert.match(html, /class="oak-openui oak-openui-ghosts" aria-hidden="true"/);
  assert.equal(html.match(/data-ghost="Steps"[\s\S]*?<\/ol>/)[0].match(/<li/g).length, 3, "the Steps ghost holds its planned three items");
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ""), /Claim 2 about Oakminder/, "the ghosts stand in for claims not yet placed");
});

test("plan plus partial program: filled blocks leave the ghost list, the rest keep plan order", () => {
  assert.deepEqual(ghosts(render({ ui: streaming(lead) })), ["Project", "Steps"]);
  assert.deepEqual(ghosts(render({ ui: streaming(`${lead}card = Project(["claim-2"])\n`) })), ["Steps"]);
});

test("a dropped block's ghost stays mounted, folded, to ease out, and a shortened card list folds its unused cards", () => {
  assert.deepEqual(ghosts(render({ ui: streaming(`${lead}how = Steps(["claim-2", "claim-3"])\n`) })), ["Project:fold"]);
  const above = [{ kind: "Prose", count: 1 }, { kind: "Project", count: 1 }, { kind: "Points", count: 2 }, { kind: "Steps", count: 3 }];
  assert.deepEqual(ghosts(render({ blocks: above, ui: streaming('root = Answer([lead, list, how])\nlead = Prose("claim-1")\nlist = Points(["claim-2", "claim-3"])\n') })), ["Project:fold", "Steps"]);
  const cards = [{ kind: "Prose", count: 1 }, { kind: "Project", count: 3 }, { kind: "Steps", count: 2 }];
  assert.deepEqual(ghosts(render({ blocks: cards, ui: streaming(`${lead}card = Project(["claim-2"])\n`) })), ["Project", "Steps"]);
  const waiting = render({ blocks: cards, ui: streaming(`${lead}card = Project(["claim-2"])\n`) }).match(/data-ghost="Project"[\s\S]*?data-ghost="Steps"/)[0];
  assert.equal(waiting.match(/oak-openui-project/g).length, 2, "two cards still to come");
  assert.deepEqual(ghosts(render({ blocks: cards, ui: streaming(`${lead}card = Project(["claim-2"])\nhow = Steps(["claim-3", "claim-4"])\n`) })), ["Project:fold"]);
});

test("an unplanned block draws with no ghost and is never placed ahead of one", () => {
  const html = render({ ui: streaming('root = Answer([lead, note, card])\nlead = Prose("claim-1")\nnote = Callout("claim-2")\n') });
  assert.deepEqual(ghosts(html), ["Project:fold", "Steps:fold"]);
  assert.match(html, /oak-openui__callout/);
});

test("a plan naming a component the client has no ghost for draws no ghost for it", () => {
  assert.deepEqual(ghosts(render({ blocks: [{ kind: "Prose", count: 1 }, { kind: "Gizmo", count: 2 }, { kind: "Sources", count: 2 }, { kind: "Points", count: 2 }] })), ["Prose", "Points"]);
});

test("every terminal state leaves no ghost and the plain answer complete", () => {
  const settled = { requestId, program: `${lead}card = Project(["claim-2"])\nhow = Steps(["claim-3", "claim-4"])\n`, status: "done" };
  for (const [name, ui] of [["done", settled], ["fallback", { requestId, status: "fallback" }], ["no data-ui at finish", null],
    ["stop, error or network drop mid-stream", streaming(lead)]]) {
    const html = render({ ui, pending: false });
    assert.deepEqual(ghosts(html), [], name);
    const text = html.replace(/<[^>]+>/g, "");
    for (const n of [1, 2, 3, 4]) assert.match(text, new RegExp(`Claim ${n} about Oakminder`), `${name}: claim ${n} on screen`);
  }
});

test("aria-busy is as today: set while the layout streams, never by the plan alone", () => {
  assert.match(render({ ui: streaming(lead) }), /aria-busy="true"/);
  assert.doesNotMatch(render(), /aria-busy/);
});

test("trace: one app-written line names the plan while the constant is on", () => {
  const message = { id: "m1", role: "assistant", text: "", answer: null, cards: [], usage: null, page: "/", state: "pending", plan,
    steps: [{ id: "search-1", operation: "search", state: "done", startedAt: 1, endedAt: 2 }] };
  const trail = on => { planFirst.forceOakPlanFirst(on); try { return renderToStaticMarkup(createElement(OakChainOfThought, { message, question: "q", progress: "" })); } finally { planFirst.forceOakPlanFirst(null); } };
  assert.match(trail(true), /Planned the answer: a lead, a project and 3 steps/);
  assert.doesNotMatch(trail(false), /Planned the answer/);
});

/** The Workspace store with a transport the test drives by hand and a composer that records focus (the r30-edges harness). */
function store() {
  const focused = [];
  const documentTarget = Object.assign(new EventTarget(), { documentElement: { dataset: {} },
    body: { dataset: { oakAgentEligible: "true", oakMascotEligible: "true", oakSourceIds: '["home-source"]' } },
    querySelectorAll: () => [], querySelector: () => null, getElementById: id => ({ focus: () => focused.push(id) }) });
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.document = documentTarget;
  globalThis.window = Object.assign(new EventTarget(), { location: { pathname: "/" }, innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980,
    visualViewport: Object.assign(new EventTarget(), { height: 900, width: 1440 }) });
  const runs = [];
  const guest = { configured: false, kind: "guest", phase: "guest", role: "visitor", publishableKey: null, purpose: null,
    allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };
  const load = createLoader({ use: [stubSets.react, stubSets.workspaceStore({
    account: { getOakAccountContext: () => ({ epoch: 0, accountVersion: 0, authenticated: false }), subscribeOakAccountContext: () => () => {},
      readOakAuthStatus: async () => guest, continueOakAccount: async () => { throw new Error("not-configured"); }, resumeOakAccount: async () => false, signOutOakAccount: async () => {} },
    handoff: { saveOakAuthHandoff: () => true, readOakAuthHandoff: () => null, clearOakAuthHandoff: () => {}, clearOakConversationHandoff: () => {} },
    transport: { streamOakTurn: (turn, signal, callbacks) => new Promise((resolve, reject) => runs.push({ turn, callbacks, resolve, reject })), cancelOakTurn: () => Promise.resolve() } })],
    stubs: {
      "../../packages/oak-agent-contracts/src/output": { renderOakAnswer: () => "Fixture answer" },
      "./oakToasts": { showOakToast: () => {} },
      "./oakSignInConfiguration": { readOakSignInConfiguration: async () => ({ kind: "sign-in-config", configured: false, publishableKey: null }) },
      "./oakDocumentsWorkspace": { getOakDocumentTurnContext: () => null, getOakDocumentsController: () => ({ snapshot: () => ({ pending: false, usedSelections: [] }), disposeOwned() {}, close() {}, cancel() {}, open() {} }),
        oakDocumentFailure: () => "Fixture document failure" },
    } });
  load("src/lib/oakVoiceWorkspace.ts");
  const workspace = load("src/lib/oakWorkspace.ts");
  workspace.installOakPresentationOwner();
  workspace.requestOakWorkspace({});
  return { workspace, runs, focused, ask: text => { workspace.setOakDraft(text); return workspace.submitOakTurn(); } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

test("store: the plan reaches the turn's message, and a visitor's Stop returns focus to the message box", async () => {
  const { workspace, runs, focused, ask } = store();
  void ask("How was Oakminder built?");
  await tick();
  runs[0].callbacks.output({ answer: null, cards: [], usage: null, research: null, plan });
  assert.deepEqual(workspace.getOakWorkspace().messages.at(-1).plan, plan);
  workspace.stopOakTurn();
  await tick();
  assert.equal(workspace.getOakWorkspace().messages.at(-1).state, "interrupted");
  assert.deepEqual(focused, ["oak-composer-input"], "focus lands on the composer, not the page body");
  runs[0].reject(new DOMException("done", "AbortError"));
});

test("store: closing the workspace stops the turn without pulling focus into the closed composer", async () => {
  const { workspace, runs, focused, ask } = store();
  void ask("How was Oakminder built?");
  await tick();
  workspace.closeOakWorkspace();
  await tick();
  assert.deepEqual(focused, []);
  runs[0].reject(new DOMException("done", "AbortError"));
});

test("store: an automatic re-ask clears the stalled request's plan", async () => {
  const { workspace, runs, ask } = store();
  void ask("How was Oakminder built?");
  await tick();
  runs[0].callbacks.output({ answer: null, cards: [], usage: null, research: null, plan });
  runs[0].reject(new Error("model-stall"));
  await tick();
  assert.equal(runs.length, 2, "the turn asks again");
  assert.equal(workspace.getOakWorkspace().messages.at(-1).plan, undefined);
  workspace.stopOakTurn();
  runs[1].reject(new DOMException("done", "AbortError"));
});

test("store: a Stop on a touch screen leaves focus alone, so no keyboard rises over the stopped answer", async () => {
  const { workspace, runs, focused, ask } = store();
  window.matchMedia = query => ({ matches: query === "(pointer: coarse)" });
  void ask("How was Oakminder built?");
  await tick();
  workspace.stopOakTurn();
  await tick();
  assert.equal(workspace.getOakWorkspace().messages.at(-1).state, "interrupted");
  assert.deepEqual(focused, []);
  runs[0].reject(new DOMException("done", "AbortError"));
});

// Gallery measurements (the ui workflow serves it; OAK_GALLERY_URL points at another server).
const measure = async (page, id, font) => {
  await openState(page, id, { settle: 300 });
  if (font) await page.addStyleTag({ content: `.oak-workspace, .oak-workspace * { font-family: ${font} !important; }` });
  return page.evaluate(() => {
    const answer = [...document.querySelectorAll(".oak-openui-answer")].at(-1);
    const height = el => el ? el.getBoundingClientRect().height : null;
    return { answer: height(answer), line: parseFloat(getComputedStyle(answer).lineHeight),
      ghosts: Object.fromEntries([...answer.querySelectorAll("[data-ghost]:not([data-fold])")].map(ghost => [ghost.dataset.ghost, height(ghost)])),
      prose: height(answer.querySelector(".oak-openui > .oak-openui__prose:not(.oak-openui-skel)")),
      steps: height(answer.querySelector(".oak-openui__steps:not(.oak-openui-skel)")),
      animations: [...answer.querySelectorAll("[data-ghost] .oak-openui-card__bar")].map(bar => getComputedStyle(bar).animationName),
      sideways: document.documentElement.scrollWidth > window.innerWidth };
  });
};

test("gallery: each ghost is within a quarter of its settled block's height, and Steps filling its ghost or a dropped ghost leaving at settle moves the frame under a line", async () => {
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      const ghost = await measure(page, "plan-first-plan-no-program"), settled = await measure(page, "answer-openui-steps");
      for (const [kind, block] of [["Prose", settled.prose], ["Steps", settled.steps]])
        assert.ok(Math.abs(ghost.ghosts[kind] - block) <= block / 4, `${width}: ${kind} ghost ${ghost.ghosts[kind]}px against ${block}px settled`);
      // Each claim wraps by its font, so the fill must hold with another font too (Linux CI wraps unlike this Mac).
      for (const font of [undefined, "monospace"]) {
        const partial = await measure(page, "plan-first-partial", font), arriving = await measure(page, "plan-first-steps-arriving", font);
        assert.ok(Math.abs(arriving.answer - partial.answer) <= partial.line, `${width} ${font ?? "Inter"}: Steps filling its ghost moves the frame ${arriving.answer - partial.answer}px`);
      }
      const after = await measure(page, "plan-first-dropped");
      const atRest = await page.evaluate(async () => {
        const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
        const workspace = await import(find("src/lib/oakWorkspace"));
        const now = workspace.getOakWorkspace(), last = now.messages.at(-1);
        workspace.setOakWorkspaceFixture({ ...now, pending: false, messages: [...now.messages.slice(0, -1), { ...last, state: "complete", ui: { ...last.ui, program: last.ui.program.replace(", src]", "]"), status: "done" } }] });
        await new Promise(resolve => setTimeout(resolve, 300));
        return [...document.querySelectorAll(".oak-openui-answer")].at(-1).getBoundingClientRect().height;
      });
      assert.ok(Math.abs(atRest - after.answer) <= after.line, `${width}: the dropped Points ghost leaves the frame to move ${atRest - after.answer}px at settle`);
      assert.equal(after.sideways || ghost.sideways, false, `${width}: no sideways scroll`);
    }
    const still = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
    assert.deepEqual([...new Set((await measure(still, "plan-first-plan-no-program")).animations)], ["none"], "reduced motion holds every ghost still");
  } finally { await browser.close(); }
});

const programOf = id => stateById(id).workspace.messages.at(-1).ui.program;
/** Swap the last turn's layout program (and plan) in place, as the stream does when more of the layout arrives. */
const swap = (page, change) => page.evaluate(async change => {
  const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
  const workspace = await import(find("src/lib/oakWorkspace"));
  const now = workspace.getOakWorkspace(), last = now.messages.at(-1);
  workspace.setOakWorkspaceFixture({ ...now, messages: [...now.messages.slice(0, -1), { ...last, plan: change.plan ?? last.plan, ui: { ...last.ui, program: change.program } }] });
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}, change);
const frame = page => page.evaluate(() => { const answer = [...document.querySelectorAll(".oak-openui-answer")].at(-1);
  return { height: answer.getBoundingClientRect().height, line: parseFloat(getComputedStyle(answer).lineHeight) }; });
const MONO = ".oak-workspace, .oak-workspace * { font-family: monospace !important; }";
// Linux CI wraps wider than this Mac: Verdana stands in for it, so the drop is measured where lines run longer.
const WIDE = ".oak-workspace, .oak-workspace * { font-family: Verdana, sans-serif !important; }";

test("gallery: a planned block the layout drops folds its ghost out over a motion step, so no frame moves the content by a line, and reduced motion shows none", async () => {
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) for (const font of [undefined, WIDE]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, "plan-first-before-drop", { settle: 300 });
      if (font) await page.addStyleTag({ content: font });
      await page.waitForTimeout(300);
      const before = await frame(page);
      await swap(page, { program: programOf("plan-first-dropped") });
      const heights = await page.evaluate(() => {
        const answer = [...document.querySelectorAll(".oak-openui-answer")].at(-1);
        const moving = document.getAnimations().filter(animation => animation instanceof CSSTransition && answer.contains(animation.effect.target));
        const read = () => answer.getBoundingClientRect().height;
        const end = Math.max(0, ...moving.map(animation => animation.effect.getComputedTiming().endTime));
        moving.forEach(animation => animation.pause());
        const out = [];
        for (let at = 0; at <= end + 16; at += 1000 / 60) { moving.forEach(animation => { animation.currentTime = Math.min(at, end); }); out.push(read()); }
        return out;
      });
      const steps = [before.height, ...heights].slice(1).map((height, index) => Math.abs(height - [before.height, ...heights][index]));
      assert.ok(Math.max(...steps) <= before.line, `${width} ${font ? "wide" : "Inter"}: the frame moves ${Math.max(...steps)}px in one frame when the Points ghost is dropped`);
      assert.ok(before.height - heights.at(-1) > 100, `${width} ${font ? "wide" : "Inter"}: the dropped ghost's space leaves the frame (${before.height} to ${heights.at(-1)})`);
      // r107 P2: the folded column takes no gap of its own, so unmounting it moves the frame by nothing.
      const unmount = await page.evaluate(() => {
        const answer = [...document.querySelectorAll(".oak-openui-answer")].at(-1);
        const before = answer.getBoundingClientRect().height;
        answer.querySelector(".oak-openui-ghosts")?.remove();
        return Math.abs(before - answer.getBoundingClientRect().height);
      });
      assert.ok(unmount < before.line / 4, `${width} ${font ? "wide" : "Inter"}: the folded ghost column's unmount moves the frame ${unmount}px`);
    }
    const still = await (await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" })).newPage();
    await openState(still, "plan-first-before-drop", { settle: 300 });
    await swap(still, { program: programOf("plan-first-dropped") });
    assert.deepEqual(await still.evaluate(() => ({ moving: document.getAnimations().filter(animation => animation instanceof CSSTransition && animation.effect.target.classList.contains("oak-openui-ghost")).length,
      folded: document.querySelector("[data-fold]").getBoundingClientRect().height })), { moving: 0, folded: 0 }, "reduced motion drops the ghost without animating it");
  } finally { await browser.close(); }
});

test("gallery: a ghost's hidden claims stay out of text, find, the accessibility tree and focus, and its bars stay clipped to its lines", async () => {
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const id of ["plan-first-partial", "plan-first-before-drop", "plan-first-plan-no-program"]) {
        await openState(page, id, { settle: 300 });
        const sized = await page.evaluate(() => {
          const claims = [...document.querySelectorAll(".oak-openui-ghost__claim")];
          return { count: claims.length, texts: claims.map(claim => claim.textContent.trim().slice(0, 28)),
            shown: claims.flatMap(claim => [claim, ...claim.querySelectorAll("*")]).filter(el => getComputedStyle(el).visibility !== "hidden").length,
            focusable: [...document.querySelectorAll(".oak-openui-ghost__claim a")].filter(link => { link.focus(); return document.activeElement === link; }).length,
            bars: [...document.querySelectorAll("[data-sized] > .oak-openui-ghost__bars")].map(bars => ({ overflow: getComputedStyle(bars).overflow, position: getComputedStyle(bars).position,
              over: bars.getBoundingClientRect().height - bars.parentElement.getBoundingClientRect().height })),
            body: document.body.innerText, found: null };
        });
        assert.ok(sized.count > 0, `${width} ${id}: the ghost has claims to size from`);
        assert.equal(sized.shown, 0, `${width} ${id}: every hidden claim and its descendants compute visibility: hidden`);
        assert.equal(sized.focusable, 0, `${width} ${id}: a hidden claim's citation takes no focus`);
        for (const text of sized.texts) {
          assert.ok(!sized.body.includes(text), `${width} ${id}: "${text}" is absent from innerText`);
          assert.equal(await page.evaluate(text => window.find(text), text), false, `${width} ${id}: find-in-page cannot see "${text}"`);
          assert.ok(!(await page.locator("body").ariaSnapshot()).includes(text), `${width} ${id}: "${text}" is absent from the accessibility tree`);
        }
        for (const bars of sized.bars) assert.deepEqual([bars.overflow, bars.position, Math.round(bars.over)], ["hidden", "absolute", 0], `${width} ${id}: the bars clip to the lines they stand for`);
      }
    }
  } finally { await browser.close(); }
});

test("gallery: Points and Prose filling their ghosts move the frame under a line in any font", async () => {
  const cases = [
    ["Points", undefined, 'root = Answer([lead, list, how])\nlead = Prose("claim-1")\nlist = Points(["claim-2", "claim-3"])\n'],
    ["Prose", [{ kind: "Prose", count: 1 }, { kind: "Prose", count: 1 }, { kind: "Steps", count: 3 }], 'root = Answer([lead, note, how])\nlead = Prose("claim-1")\nnote = Prose("claim-2")\n'],
  ];
  const moved = [];
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) for (const [kind, blocks, program] of cases) for (const font of [undefined, MONO, WIDE]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, "plan-first-before-drop", { settle: 300 });
      if (blocks) await swap(page, { plan: { blocks }, program: programOf("plan-first-before-drop") });
      if (font) await page.addStyleTag({ content: font });
      await page.waitForTimeout(300);
      const partial = await frame(page);
      await swap(page, { program });
      await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {}))));
      const arriving = await frame(page);
      if (Math.abs(arriving.height - partial.height) > 4) moved.push(`${width} ${font === MONO ? "monospace" : font ? "wide" : "Inter"}: ${kind} filling its ghost moves the frame ${arriving.height - partial.height}px`);
    }
  } finally { await browser.close(); }
  assert.deepEqual(moved, []);
});

test("OakTurn: a planned answer standing under the live trail stays mounted while the turn completes and the trail folds", async () => {
  const browser = await launchSlowLazy();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "plan-first-steps-arriving", { settle: 300 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace"));
      const turn = () => [...document.querySelectorAll("[data-slot='message'][data-state]")].at(-1);
      const samples = [];
      const sample = () => samples.push({ state: turn()?.dataset.state, held: turn()?.hasAttribute("data-held"), shown: turn()?.querySelectorAll(".oak-turn__answer").length ?? 0 });
      sample();
      const observer = new MutationObserver(sample);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-held", "data-state"] });
      const now = workspace.getOakWorkspace(), last = now.messages.at(-1);
      workspace.setOakWorkspaceFixture({ ...now, pending: false, progress: "", messages: [...now.messages.slice(0, -1),
        { ...last, state: "complete", ui: { ...last.ui, status: "done" }, steps: last.steps.map(step => ({ ...step, state: "done", endedAt: step.endedAt ?? 0 })) }] });
      await new Promise(resolve => setTimeout(resolve, 3000));
      observer.disconnect();
      sample();
      return samples;
    });
    assert.equal(result[0].shown, 1, "the planned answer stands under the live trail");
    assert.equal(result.at(-1).state, "complete");
    assert.deepEqual(result.filter(s => s.held || s.shown !== 1), [], "the answer never unmounts or holds at done");
    await openState(page, "plan-first-off", { settle: 300 });
    assert.deepEqual(await page.evaluate(() => { const turn = [...document.querySelectorAll("[data-slot='message'][data-state]")].at(-1);
      return { held: turn.hasAttribute("data-held"), shown: turn.querySelectorAll(".oak-turn__answer").length }; }), { held: true, shown: 0 },
    "with the constant off a planned turn holds its answer under the live trail, as main does");
  } finally { await browser.close(); }
});

test("gallery: with no program yet the first ghost sits at the answer's top, so drawing the lead moves the frame under a line", async () => {
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, "plan-first-plan-no-program", { settle: 300 });
      const top = await page.evaluate(() => { const answer = [...document.querySelectorAll(".oak-openui-answer")].at(-1);
        return answer.querySelector("[data-ghost]:not([data-fold])").getBoundingClientRect().top - answer.getBoundingClientRect().top; });
      assert.ok(Math.abs(top) < 1, `${width}: the first ghost sits ${top}px below the answer's top`);
      const before = await frame(page);
      await page.evaluate(async program => {
        const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
        const workspace = await import(find("src/lib/oakWorkspace"));
        const now = workspace.getOakWorkspace(), last = now.messages.at(-1);
        workspace.setOakWorkspaceFixture({ ...now, messages: [...now.messages.slice(0, -1), { ...last, ui: { ...last.ui, status: "streaming", program } }] });
        await new Promise(resolve => setTimeout(resolve, 700));
      }, programOf("plan-first-partial"));
      const after = await frame(page);
      assert.ok(Math.abs(after.height - before.height) < before.line, `${width}: drawing the lead moves the frame ${after.height - before.height}px`);
    }
  } finally { await browser.close(); }
});

const TRAILING = 'root = Answer([lead, list])\nlead = Prose("claim-1")\nlist = Points(["claim-2", "claim-3", "claim-4", "claim-5"])\n';
const droppedBeforeSettle = () => programOf("plan-first-dropped").replace(", src]", "]");
/** Set the last turn's layout, settle the turn, then step every transition the answer holds at 60 frames a second and read its height each step. */
const settling = (page, { stream, settled, delay = 0 }) => page.evaluate(async ({ stream, settled, delay }) => {
  const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
  const workspace = await import(find("src/lib/oakWorkspace"));
  const answer = () => [...document.querySelectorAll(".oak-openui-answer")].at(-1);
  // Read after the frame paints, as trailSettle does: inside its own rAF callback a read can run before Motion's and see the frame before.
  const frame = () => new Promise(resolve => requestAnimationFrame(() => { const hop = new MessageChannel(); hop.port1.onmessage = () => resolve(); hop.port2.postMessage(0); }));
  const set = (program, done) => { const now = workspace.getOakWorkspace(), last = now.messages.at(-1);
    workspace.setOakWorkspaceFixture({ ...now, pending: !done, messages: [...now.messages.slice(0, -1), { ...last, state: done ? "complete" : last.state, ui: { ...last.ui, program, status: done ? "done" : "streaming" } }] }); };
  set(stream, false);
  await frame(); await frame();
  await new Promise(resolve => setTimeout(resolve, delay));
  const running = () => answer().getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition);
  // A slow runner takes several real frames to reach the settle: rewind to the moment of the first reading so that time is not one step.
  const folding = new Map(running().map(animation => [animation, animation.currentTime]));
  const heights = [answer().getBoundingClientRect().height];
  set(settled, true);
  await frame();
  const moving = running();
  moving.forEach(animation => { animation.pause(); animation.currentTime = folding.get(animation) ?? 0; });
  const from = moving.map(animation => animation.currentTime), end = Math.max(0, ...moving.map((animation, index) => animation.effect.getComputedTiming().endTime - from[index]));
  for (let at = 0; at <= end + 1000 / 60; at += 1000 / 60) {
    moving.forEach((animation, index) => { animation.currentTime = Math.min(from[index] + at, animation.effect.getComputedTiming().endTime); });
    heights.push(answer().getBoundingClientRect().height);
  }
  moving.forEach(animation => animation.finish());
  await new Promise(resolve => setTimeout(resolve, 150));
  return { heights, moved: moving.filter(animation => animation.effect.target.classList.contains("oak-openui-ghost")).length, line: parseFloat(getComputedStyle(answer()).lineHeight), ghosts: answer().querySelectorAll("[data-ghost]").length, column: answer().querySelectorAll(".oak-openui-ghosts").length };
}, { stream, settled, delay });
const biggestStep = heights => Math.max(...heights.slice(1).map((height, index) => Math.abs(height - heights[index])));
const SETTLE_CASES = [
  ...[0, 100, 250].map(delay => ({ name: `done ${delay}ms after a skip`, delay, stream: programOf("plan-first-dropped"), settled: droppedBeforeSettle() })),
  { name: "a planned trailing block the layout never draws", delay: 600, stream: TRAILING, settled: TRAILING },
];

test("gallery: a turn that settles with ghosts open, mid-fold or never drawn moves no frame by a line, in Inter and Verdana", async () => {
  const moved = [];
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) for (const font of [undefined, WIDE]) for (const { name, ...change } of SETTLE_CASES) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await openState(page, "plan-first-before-drop", { settle: 300 });
      if (font) await page.addStyleTag({ content: font });
      await page.waitForTimeout(300);
      const settled = await settling(page, change);
      const step = biggestStep(settled.heights);
      if (step > settled.line) moved.push(`${width} ${font ? "wide" : "Inter"}: ${name} moves the frame ${step.toFixed(1)}px in one frame`);
      assert.deepEqual([settled.ghosts, settled.column], [0, 0], `${width} ${name}: the fold ends and the column unmounts`);
      await context.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(moved, []);
});

test("gallery: reduced motion settles a turn with open ghosts without a fold", async () => {
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) for (const { name, ...change } of SETTLE_CASES) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      await openState(page, "plan-first-before-drop", { settle: 300 });
      const settled = await settling(page, change);
      assert.deepEqual([settled.moved, settled.ghosts, settled.column], [0, 0, 0], `${width} ${name}: no ghost is left to fold`);
      await context.close();
    }
  } finally { await browser.close(); }
});

// Ticket 121 and 127: at settle the plan row glides with the other trail rows, the folding trail never drops the turn by a jump,
// and no answer block moves more than a line and a half in one frame, measured raw per frame and normalised by frame time.
const THOUGHT = "Weighing what the case study says about the build and which parts a reader can verify. ".repeat(5);
const trailSettle = (page, { stream, settled, delay, think = false }, { planFirst = true, stall = 0, jump = 0 } = {}) => page.evaluate(async ({ stream, settled, delay, think, planFirst, thought, stall, jump }) => {
  const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
  const workspace = await import(find("src/lib/oakWorkspace"));
  if (!planFirst) (await import(find("src/lib/oakFlags/planFirst"))).forceOakPlanFirst(false);
  const turn = () => [...document.querySelectorAll("[data-slot='message'][data-state]")].at(-1);
  const set = (program, done) => { const now = workspace.getOakWorkspace(), last = now.messages.at(-1), at = Date.now();
    const startedAt = last.steps.find(step => step.id === "think-x")?.startedAt ?? at - 400;
    const steps = think ? [...last.steps.filter(step => step.id !== "think-x").slice(0, -1), { id: "think-x", operation: "think", state: done ? "done" : "running", startedAt, ...(done ? { endedAt: at } : {}), thought: { title: "Weighing", text: thought } }, last.steps.at(-1)] : last.steps;
    workspace.setOakWorkspaceFixture({ ...now, pending: !done, messages: [...now.messages.slice(0, -1), { ...last, steps, state: done ? "complete" : last.state, ui: { ...last.ui, program, status: done ? "done" : "streaming" } }] }); };
  // A sample reads what the frame painted: inside its own rAF callback it can run before Motion's and read the frame before,
  // which on Linux's 50 to 100ms software frames reads as a 50 to 100px jump. A message posted from rAF runs once every callback has.
  const frame = () => new Promise(resolve => requestAnimationFrame(() => { const hop = new MessageChannel(); hop.port1.onmessage = () => resolve(); hop.port2.postMessage(0); }));
  const edge = (selector, side = "top") => { const element = turn().querySelector(selector); return element ? element.getBoundingClientRect()[side] : null; };
  set(stream, false);
  await frame(); await frame();
  await new Promise(resolve => setTimeout(resolve, delay));
  const kinds = [...turn().querySelectorAll(".oak-cot__step")].map(row => row.dataset.kind);
  const typing = Boolean(turn().querySelector(".oak-cot__thought [data-streaming]"));
  const log = [];
  let jumped = false;
  const t0 = performance.now();
  set(settled, true);
  while (performance.now() - t0 < 1000 || (turn().querySelector(".ui-chain-of-thought") && performance.now() - t0 < 4000)) {
    log.push({ t: performance.now() - t0, height: turn().querySelector(".ui-chain-of-thought")?.getBoundingClientRect().height ?? 0,
      tops: { "answer top": edge(".oak-openui-answer"), "lead top": edge(".oak-openui-answer .oak-openui > *"), "ghosts top": edge(".oak-openui-ghosts") },
      rows: [...turn().querySelectorAll(".oak-cot__step")].map(row => { const box = row.getBoundingClientRect(); return { kind: row.dataset.kind, top: box.top, bottom: box.bottom }; }) });
    if (jump && performance.now() - t0 > 300 && !jumped) { jumped = true; turn().querySelector(".oak-openui-answer").style.marginTop = `${jump}px`; }
    if (stall) for (const from = performance.now(); performance.now() - from < stall;);
    await frame();
  }
  return { kinds, typing, log, line: parseFloat(getComputedStyle([...document.querySelectorAll(".oak-openui-answer")].at(-1) ?? turn()).lineHeight) };
}, { stream, settled, delay, think, planFirst, thought: THOUGHT, stall, jump });
/**
 * The deepest a row's bottom reaches into the next row, and the fastest the trail's height and any answer block's top move, each
 * per frame. `step` is the move normalised to a 60 Hz frame (by the slower of this frame and the last, so a catch-up after a
 * stalled frame does not read as a jump). `raw` is what a frame moves beyond what the frames around it were moving at, scaled by
 * its own duration at any frame time, so a stalled frame cannot hide a one-frame jump. A block counts only in frames where it is
 * on screen both before and after. The footer and the related rows enter below the answer in the same frame, so the whole turn's
 * height is not a block's move. Without the plan the trail folds out of the flow by design (the answer arrives under its header),
 * so only the answer's top counts there.
 */
const trailMoves = ({ log, line }, { turn: trail = true } = {}) => {
  let overlap = 0, step = 0, raw = 0, worst = "";
  const dts = log.map((now, index) => index ? now.t - log[index - 1].t : 0);
  if (trail) for (const now of log) for (let row = 1; row < now.rows.length; row++) overlap = Math.max(overlap, now.rows[row - 1].bottom - now.rows[row].top);
  const series = [...(trail ? [["trail", now => now.height]] : []), ...["answer top", "lead top", "ghosts top"].map(name => [name, now => now.tops[name]])];
  for (const [name, read] of series) {
    const moves = log.map((now, index) => index && read(now) !== null && read(log[index - 1]) !== null ? read(now) - read(log[index - 1]) : null);
    moves.forEach((change, index) => {
      if (change === null) return;
      const normal = Math.abs(change) / Math.max(Math.max(dts[index], dts[index - 1] ?? 0) / (1000 / 60), 1);
      if (normal > step) { step = normal; worst = `${name} at ${Math.round(log[index].t)}ms`; }
      const around = [-2, -1, 1, 2].map(offset => moves[index + offset] == null ? 0 : Math.abs(moves[index + offset]) / dts[index + offset]);
      raw = Math.max(raw, Math.abs(change) - dts[index] * Math.max(0, ...around));
    });
  }
  return { overlap, step, raw, worst, line };
};
const TRAIL_CASES = [
  { name: "a dropped block, done 100ms after a skip", delay: 100, stream: programOf("plan-first-dropped"), settled: droppedBeforeSettle() },
  { name: "a planned trailing block never drawn", delay: 600, stream: TRAILING, settled: TRAILING },
  { name: "a thought still typing at the settle", delay: 1500, think: true, stream: programOf("plan-first-dropped"), settled: droppedBeforeSettle() },
];

test("gallery: at settle the plan row glides with its neighbours and no answer block or the trail moves more than a line and a half in a frame, with the plan on and off, in Inter and Verdana", async () => {
  const moved = [];
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) for (const font of [undefined, WIDE]) for (const planFirst of [true, false]) for (const { name, ...change } of TRAIL_CASES) {
      // Each case closes its page: an open page keeps drawing frames, and on Linux's software renderer five of them slowed every frame past 300ms.
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await openState(page, "plan-first-before-drop", { settle: 300 });
      if (font) await page.addStyleTag({ content: font });
      await page.waitForTimeout(300);
      const settled = await trailSettle(page, change, { planFirst });
      const label = `${width} ${font ? "wide" : "Inter"} ${planFirst ? "plan" : "no plan"}: ${name}`;
      if (planFirst) assert.ok(settled.kinds.includes("plan"), `${label}: the plan row stands in the trail`);
      if (change.think) assert.ok(settled.typing, `${label}: the thought is still typing at the settle`);
      const { overlap, step, raw, worst, line } = trailMoves(settled, { turn: planFirst });
      if (overlap > 1) moved.push(`${label} draws a row ${overlap.toFixed(1)}px over the one below`);
      if (step > line * 1.5) moved.push(`${label} moves the ${worst} ${step.toFixed(1)}px in one frame`);
      if (raw > line * 2) moved.push(`${label} moves a block ${raw.toFixed(1)}px between two frames`);
      await context.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(moved, []);
});

// The cap holds on slow frames too: one deliberate 60px jump, on frames stalled to about 45ms, is caught at both widths.
test("gallery: the trail step test catches a deliberate 60px one-frame jump on slow frames", async () => {
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await openState(page, "plan-first-before-drop", { settle: 300 });
      await page.waitForTimeout(300);
      const { raw, line } = trailMoves(await trailSettle(page, TRAIL_CASES[0], { stall: 30, jump: 60 }));
      assert.ok(raw > line * 2, `${width}: a 60px jump reads ${raw.toFixed(1)}px beyond its neighbours, under the ${line * 2}px cap`);
      await context.close();
    }
  } finally { await browser.close(); }
});

// Ticket 137: a thought that starts under half a second before the settle grows in on the held fold's spring, so the answer under
// it moves at most one line a frame (its row's grow used to fix its height at the start and snap open when the 400ms finish outgrew it).
test("gallery: a thought that starts 300 or 450ms before the settle grows in and moves the answer at most a line a frame, with the plan on and off", async () => {
  const moved = [];
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) for (const planFirst of [true, false]) for (const delay of [300, 450]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await openState(page, "plan-first-before-drop", { settle: 300 });
      await page.waitForTimeout(300);
      const settled = await trailSettle(page, { ...TRAIL_CASES[0], delay, think: true }, { planFirst });
      const label = `${width} ${planFirst ? "plan" : "no plan"} ${delay}ms`;
      assert.ok(settled.typing, `${label}: the thought is still typing at the settle`);
      const { step, raw, worst, line } = trailMoves(settled, { turn: planFirst });
      if (step > line) moved.push(`${label}: a late thought moves the ${worst} ${step.toFixed(1)}px in one frame`);
      if (raw > line * 2) moved.push(`${label}: a late thought moves a block ${raw.toFixed(1)}px between two frames`);
      await context.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(moved, []);
});

// Reduced motion swaps the trail for the answer at once: every sample counts, and the swap is one frame, never an animation.
test("gallery: reduced motion settles the plan-first trail with no overlap and one instant swap", async () => {
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) for (const { name, ...change } of TRAIL_CASES) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" })).newPage();
      await openState(page, "plan-first-before-drop", { settle: 300 });
      const trail = await trailSettle(page, change);
      const { overlap } = trailMoves(trail);
      assert.ok(overlap <= 1, `${width} ${name}: rows overlap ${overlap}px`);
      const changes = trail.log.slice(1).filter((now, index) => Math.abs(now.height - trail.log[index].height) > 1).length;
      assert.ok(changes <= 1, `${width} ${name}: reduced motion swaps the trail in one frame, not over ${changes}`);
    }
  } finally { await browser.close(); }
});

// Ticket 122: the Worker sends the plan at the first search and the answer only after the claims call, so the ghosts draw from
// the plan alone and the answer then lands into them.
const ghostsNow = page => page.evaluate(() => {
  const ghosts = [...document.querySelectorAll("[data-ghost]:not([data-fold])")];
  const answer = [...document.querySelectorAll(".oak-openui-answer")].at(-1);
  return { kinds: ghosts.map(ghost => ghost.dataset.ghost), heights: ghosts.map(ghost => ghost.getBoundingClientRect().height),
    marks: performance.getEntriesByType("mark").filter(mark => mark.name.startsWith("oak:first-ghost:")).map(mark => mark.name),
    line: answer ? parseFloat(getComputedStyle(answer).lineHeight) : 0 };
});
/** Land the answer on the planned turn, then read the first ghost's top and the answer's height every frame for a while. */
const landAnswer = (page, answer) => page.evaluate(async answer => {
  const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
  const workspace = await import(find("src/lib/oakWorkspace"));
  const read = () => { const answer = [...document.querySelectorAll(".oak-openui-answer")].at(-1);
    return { top: answer?.querySelector("[data-ghost]:not([data-fold])")?.getBoundingClientRect().top ?? null, height: answer?.getBoundingClientRect().height ?? null }; };
  const log = [read()];
  const now = workspace.getOakWorkspace(), last = now.messages.at(-1);
  workspace.setOakWorkspaceFixture({ ...now, messages: [...now.messages.slice(0, -1), { ...last, answer }] });
  for (let frame = 0; frame < 45; frame++) { await new Promise(resolve => requestAnimationFrame(resolve)); log.push(read()); }
  return log;
}, answer);

test("gallery: a planned turn with no answer yet draws one ghost per planned block, marks the first, and the answer lands with the ghosts held still", async () => {
  const answer = stateById("plan-first-plan-no-program").workspace.messages.at(-1).answer;
  const browser = await launchSlowLazy();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, "plan-first-plan-no-answer", { settle: 300 });
      const before = await ghostsNow(page);
      assert.deepEqual(before.kinds, ["Prose", "Steps"], `${width}: one ghost per planned block with a ghost, before data-answer`);
      assert.ok(before.heights.every(height => height > before.line), `${width}: each ghost holds its kind's height (${before.heights})`);
      assert.equal(before.marks.length, 1, `${width}: the first drawn ghost sets one first-ghost mark`);
      const log = await landAnswer(page, answer);
      const travel = Math.max(...log.map(entry => Math.abs(entry.top - log[0].top)));
      assert.ok(travel <= 1, `${width}: the first ghost stays put as the answer lands (moved ${travel}px)`);
      for (const key of ["top", "height"]) {
        const steps = log.slice(1).map((now, index) => Math.abs(now[key] - log[index][key]));
        assert.ok(log.every(entry => entry[key] !== null), `${width}: the ghost column stays mounted as the answer lands`);
        assert.ok(Math.max(...steps) <= before.line, `${width}: the answer landing moves the ghosts' ${key} ${Math.max(...steps)}px in one frame`);
      }
      const after = await ghostsNow(page);
      assert.deepEqual(after.kinds, ["Prose", "Steps"], `${width}: the same ghosts stand after data-answer`);
      assert.equal(after.marks.length, 1, `${width}: the answer landing sets no second mark`);
    }
    const still = await (await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" })).newPage();
    await openState(still, "plan-first-plan-no-answer");
    assert.deepEqual(await still.evaluate(() => {
      const column = document.querySelector(".oak-openui-ghosts");
      const faded = [];
      for (let el = column; el; el = el.parentElement) if (parseFloat(getComputedStyle(el).opacity) < 1) faded.push(el.className);
      return { ghosts: document.querySelectorAll("[data-ghost]:not([data-fold])").length, faded,
        moving: column ? [...column.querySelectorAll(".oak-openui-card__bar")].map(bar => getComputedStyle(bar).animationName).filter(name => name !== "none").length : -1 };
    }), { ghosts: 2, faded: [], moving: 0 }, "reduced motion draws the ghosts at once, with no fade and no sweep");
  } finally { await browser.close(); }
});

test("gallery: with oakPlanFirst off, a finished trail's Sources found row runs no animation after load", async () => {
  const browser = await launchSlowLazy();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    for (const id of ["trail-steps", "trail-steps-none", "trail-steps-count"]) {
      await openState(page, id);
      const found = await page.evaluate(() => {
        const group = document.querySelector('[aria-label="Sources found"]');
        if (!group) return null;
        const row = group.closest(".oak-cot__step");
        const chain = [];
        for (let el = group; el && el !== row; el = el.parentElement) chain.push(el);
        return document.getAnimations().filter(animation => animation.playState === "running" && chain.includes(animation.effect?.target))
          .map(animation => animation.animationName ?? "js");
      });
      assert.ok(found, `${id}: the trail shows its Sources found row`);
      assert.deepEqual(found, [], `${id}: the settled row and its wrappers do not ease in`);
    }
  } finally { await browser.close(); }
});
