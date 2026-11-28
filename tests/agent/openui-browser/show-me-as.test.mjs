import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "../premium/gallery.mjs";

// Ticket 19 (Q34 A): an arranged answer reorders its blocks for the visitor's purpose behind oakShowMeAs; the lead stays first.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/showMeAs.ts");
const { oakShowMeAsProgram, OakShowMeAs } = loadTsx("src/components/agent/OakShowMeAs.tsx");
const { oakOpenUIIntro } = loadTsx("packages/oak-agent-contracts/src/openui/verdict.ts");

const lines = (...rows) => rows.join("\n");
const stack = lines("root = Answer([lead, tools, eco, mind, ol, src, next])", "lead = Prose(\"claim-1\")", "tools = Stack()",
  "eco = Project([\"claim-3\"])", "mind = Project([\"claim-4\"])", "ol = Role([\"claim-2\"])", "src = Sources()", "next = Pills([\"Q?\"])");
const steps = lines("root = Answer([lead, ctx, how, src])", "lead = Prose(\"claim-1\")", "ctx = Points([\"claim-2\", \"claim-3\"])",
  "how = Steps([\"claim-4\", \"claim-5\"])", "src = Sources()");
const rootOf = program => program.match(/^root = Answer\(\[(.*)\]\)$/m)[1].split(", ");

test("constant: oakShowMeAs is pinned in flag-pins, and a force flips it both ways", () => {
  flag.forceOakShowMeAs(true);
  assert.equal(flag.oakShowMeAsOn(), true);
  flag.forceOakShowMeAs(null);
  assert.equal(flag.oakShowMeAsOn(), flag.oakShowMeAs);
  flag.forceOakShowMeAs(false);
  assert.equal(flag.oakShowMeAsOn(), false);
  flag.forceOakShowMeAs(null);
  assert.equal(flag.oakShowMeAsOn(), flag.oakShowMeAs);
});

test("each purpose gives ticket 16's order, and the lead never moves", () => {
  assert.deepEqual(rootOf(oakShowMeAsProgram(stack, "recruiter")), ["lead", "ol", "tools", "eco", "mind", "src", "next"]);
  assert.deepEqual(rootOf(oakShowMeAsProgram(stack, "collaborator")), ["lead", "tools", "eco", "mind", "ol", "src", "next"]);
  assert.deepEqual(rootOf(oakShowMeAsProgram(steps, "learner")), ["lead", "how", "ctx", "src"]);
  assert.deepEqual(rootOf(oakShowMeAsProgram(steps, "collaborator")), ["lead", "how", "ctx", "src"]);
  assert.equal(oakShowMeAsProgram(steps, "recruiter"), steps, "an order that does not change prints back as written");
  assert.equal(oakShowMeAsProgram(stack, undefined), stack);
  const roleLead = lines("root = Answer([ol, how])", "ol = Role([\"claim-1\"])", "how = Steps([\"claim-2\"])");
  assert.deepEqual(rootOf(oakShowMeAsProgram(roleLead, "learner")), ["ol", "how"], "the first block stays first even when another leads");
  assert.equal(oakShowMeAsProgram("not a program", "recruiter"), "not a program");
});

// Review r1 P1: the corpus answer in two phases, each a Heading over its Steps.
const phases = lines("root = Answer([lead, h1, a, h2, b, src])", "lead = Prose(\"claim-1\")", "h1 = Heading(\"First build\")",
  "a = Steps([\"claim-2\", \"claim-3\"])", "h2 = Heading(\"Later versions\")", "b = Steps([\"claim-4\", \"claim-5\"], 3)", "src = Sources()");

test("a Heading and the block under it move as one, and the lead with its Headings stays first", () => {
  for (const audience of ["recruiter", "collaborator", "learner"]) assert.equal(oakShowMeAsProgram(phases, audience), phases, `${audience}: both phases keep their headings`);
  const sections = lines("root = Answer([lead, h1, ctx, h2, how, src])", "lead = Prose(\"claim-1\")", "h1 = Heading(\"Context\")",
    "ctx = Points([\"claim-2\"])", "h2 = Heading(\"How\")", "how = Steps([\"claim-3\", \"claim-4\"])", "src = Sources()");
  assert.deepEqual(rootOf(oakShowMeAsProgram(sections, "learner")), ["lead", "h2", "how", "h1", "ctx", "src"]);
  const headed = lines("root = Answer([h, lead, ol, src])", "h = Heading(\"Oak Labs\")", "lead = Prose(\"claim-1\")", "ol = Role([\"claim-2\"])", "src = Sources()");
  assert.equal(oakShowMeAsProgram(headed, "recruiter"), headed, "the Prose lead under a Heading stays the lead");
  const tail = lines("root = Answer([lead, src, ol, h])", "lead = Prose(\"claim-1\")", "src = Sources()", "ol = Role([\"claim-2\"])", "h = Heading(\"End\")");
  assert.deepEqual(rootOf(oakShowMeAsProgram(tail, "recruiter")), ["lead", "ol", "src", "h"]);
});

const citation = { documentId: "work:oakminder", passageId: "work:oakminder:passage-001", sectionId: "work:oakminder", url: "https://steveoak.com/work/oakminder/" };
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: [],
  kind: "sourced", acknowledgment: null, claims: [1, 2, 3].map(n => ({ id: `claim-${n}`, text: `Claim ${n} about Oakminder.`, citations: [citation] })) };
const framed = lines("root = Answer([h, t, nums, src])", "h = Heading(\"Oakminder\")", "t = Timeline([a])", "a = TimelineItem(\"2024\", \"claim-1\")",
  "nums = Stats([m])", "m = Metric(\"Users\", \"3\", \"claim-2\")", "src = Sources()");
const led = lines("root = Answer([lead, t, h, nums, src])", "lead = Prose(\"claim-1\")", "t = Timeline([a])", "a = TimelineItem(\"2024\", \"claim-2\")",
  "h = Heading(\"Numbers\")", "nums = Stats([m])", "m = Metric(\"Users\", \"3\", \"claim-3\")", "src = Sources()");
const render = (program, purpose) => renderToStaticMarkup(createElement(OakShowMeAs, { id: "m1", answer, question: "q", latest: true, purpose,
  ui: { requestId: "00000000-0000-4000-8000-0000000000b9", program, status: "done" } }));

test("the first shown block never moves, so the framing line stays", () => {
  assert.equal(oakShowMeAsProgram(framed, "recruiter"), framed, "the Heading's Timeline is the first unit");
  assert.deepEqual(rootOf(oakShowMeAsProgram(led, "recruiter")), ["lead", "h", "nums", "t", "src"]);
  assert.equal(oakOpenUIIntro(["Prose", "Heading", "Stats", "Timeline", "Sources"]), oakOpenUIIntro(["Prose", "Timeline", "Heading", "Stats", "Sources"]));
});

test("a known purpose shows only the capsule and Undo; none shows the switch as a radiogroup", () => {
  const known = render(led, "recruiting");
  assert.match(known, /Ordered for a recruiter/);
  assert.match(known, />Undo</);
  assert.doesNotMatch(known, /role="radiogroup"/);
  const none = render(led, null);
  assert.doesNotMatch(none, /Ordered for/);
  assert.match(none, /role="radiogroup"[^>]*aria-label="Show me as"/);
  assert.deepEqual([...none.matchAll(/role="radio"[^>]*>[\s\S]*?<\/span>/g)].length, 3, "three audiences, three radios");
  const still = render(steps.replace("ctx, how", "how, ctx"), "exploring");
  assert.equal(still.includes("Ordered for"), false, "no capsule when the purpose changes nothing");
  assert.doesNotMatch(still, /role="radiogroup"/, "a known purpose that changes nothing shows no switch either");
});

// Gallery (OAK_GALLERY_URL points at the lane's server).
const order = page => page.evaluate(() => [...document.querySelectorAll(".oak-show-me-as")].map(answer =>
  [...(answer.querySelector(".oak-openui-answer .oak-openui")?.children ?? [])].map(child => child.className.split(" ")[0])));
const listen = page => page.evaluate(() => {
  window.__said = [];
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => window.__said.push(node.textContent))))
    .observe(document.querySelector("[aria-live='polite']"), { childList: true, subtree: true });
});
const said = page => page.waitForTimeout(150).then(() => page.evaluate(() => window.__said.filter(Boolean)));

test("gallery: every choice and every Undo is announced, also on a repeat, and Undo hands focus to the capsule", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "show-me-as-none", { settle: 300 });
    await listen(page);
    const group = page.locator(".oak-show-me-as [role='radiogroup']").first();
    for (const name of ["Recruiter", "Collaborator", "Recruiter"]) { await group.getByRole("radio", { name }).click(); await page.waitForTimeout(80); }
    assert.deepEqual(await said(page), ["Reordered for a recruiter.", "Reordered for a collaborator.", "Reordered for a recruiter."]);

    await openState(page, "show-me-as-recruiter", { settle: 300 });
    await listen(page);
    await page.getByRole("button", { name: "Undo" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.activeElement?.className), "oak-show-me-as__capsule", "focus stays in the answer, never body");
    await page.keyboard.press("Enter");
    await page.locator(".oak-show-me-as [role='radiogroup']").getByRole("radio", { name: "Recruiter" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    assert.deepEqual(await said(page), ["Original order.", "Reordered for a recruiter.", "Original order."], "a second Undo is heard");
  } finally { await browser.close(); }
});

test("gallery: capsule and Undo, the switch, arrow keys, one polite announcement, no request, no sideways scroll", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, "show-me-as-recruiter", { settle: 300 });
      const requests = [];
      page.on("request", request => { if (!/\/(@vite|src|node_modules|@fs|@id)\//.test(new URL(request.url()).pathname)) requests.push(request.url()); });
      const before = await order(page);
      assert.equal(await page.locator(".oak-show-me-as [role='radiogroup']").count(), 0, `${width}: no switch with a known purpose`);
      assert.equal(await page.locator(".oak-show-me-as__capsule").innerText(), "Ordered for a recruiter");
      await page.getByRole("button", { name: "Undo" }).click();
      await page.waitForTimeout(100);
      assert.notDeepEqual(await order(page), before, `${width}: Undo restores the original order`);
      const live = await page.evaluate(() => [...document.querySelectorAll("[aria-live='polite']")].map(region => region.textContent).join("|"));
      assert.match(live, /Original order/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${width}: no sideways scroll`);
      assert.deepEqual(requests, [], `${width}: no request`);

      await openState(page, "show-me-as-none", { settle: 300 });
      const groups = page.locator(".oak-show-me-as [role='radiogroup']");
      assert.equal(await groups.count(), 2, "each answer has its own switch");
      const start = await order(page);
      await groups.last().getByRole("radio", { name: "Recruiter" }).focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Collaborator", "arrow keys move the choice");
      const after = await order(page);
      assert.deepEqual(after[0], start[0], "the other answer keeps its order");
      assert.notDeepEqual(after[1], start[1]);
      const said = await page.evaluate(() => [...document.querySelectorAll("[aria-live='polite']")].map(region => region.textContent).join("|"));
      assert.equal(said.match(/Reordered for a collaborator/g)?.length, 1, "announced once");
    }
    const off = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(off, "show-me-as-off", { settle: 300 });
    assert.equal(await off.locator(".oak-show-me-as").count(), 0, "constant off: as main");
    const still = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
    await openState(still, "show-me-as-none", { settle: 300 });
    const motion = await still.evaluate(() => [...document.querySelectorAll(".oak-show-me-as__switch *, .oak-show-me-as__bar *, .oak-show-me-as .oak-openui > *")].map(el => getComputedStyle(el))
      .filter(style => style.animationName !== "none" || parseFloat(style.transitionDuration) > 0.001).length);
    assert.equal(motion, 0, "reduced motion: nothing moves");
  } finally { await browser.close(); }
});
