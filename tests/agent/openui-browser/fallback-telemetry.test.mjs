import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { figureHarness, openHarness, repo } from "./figure-helpers.mjs";

// Ticket 14b: a live arranged answer that falls back reports its first failing registered component and the OpenUI code,
// and nothing else. Timeline is forced to throw while rendering; two more answers fail to parse.
const entry = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { OakArrangedAnswer } from "@/components/agent/OakOpenUIAnswer";
import { oakRenderLibrary } from "@/lib/openui";
import states from "@/data/dev/oak-states.json";

const sent: string[] = [];
// The harness origin is not a secure context, so randomUUID is missing there.
(crypto as any).randomUUID ??= () => "00000000-0000-4000-8000-000000000000";
window.fetch = async (url: any, init?: any) => { if (String(url).includes("/api/oak/funnel")) sent.push(String(init?.body)); return new Response(null, { status: 202 }); };
Object.assign(window, { sent: () => sent });
(oakRenderLibrary.components as any).Timeline.component = () => { throw new Error("PRIVATE crash message"); };

const settled = (states as any[]).find(state => state.id === "answer-openui-settled").workspace.messages[1];
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", operations: [], characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", ...settled.answer };
const program = (text: string) => ({ requestId: "r", status: "done", program: text });
const ui: Record<string, unknown> = {
  render: settled.ui,
  missing: program('root = Answer([t, p])\\nt = Timeline([a, b])\\na = TimelineItem("September to December 2025")\\nb = TimelineItem("January 30, 2026", "claim-2")\\np = Prose("claim-3")'),
  streaming: { ...settled.ui, status: "streaming" },
  unknown: program('root = Answer([z, t, p])\\nz = Zq1("claim-1")\\nt = Timeline([b])\\nb = TimelineItem("January 30, 2026", "claim-2")\\np = Prose("claim-3")'),
};
// The live path: the same answer streams first, then settles with the block still crashing.
const draw = (settle: boolean) => <>{Object.entries(ui).map(([id, value]) =>
  <section key={id} data-case={id}><OakArrangedAnswer id={id} answer={answer as any} ui={value as any} live latest={false} question="Q" /></section>)}
  <section data-case="settles"><OakArrangedAnswer id="settles" answer={answer as any} ui={settle ? settled.ui : ui.streaming as any} live latest={false} question="Q" /></section></>;
const root = createRoot(document.getElementById("root")!);
root.render(draw(false));
setTimeout(() => root.render(draw(true)), 300);
setTimeout(() => { document.documentElement.dataset.ready = "true"; }, 700);
`;

let browser, page, close, claims;
before(async () => {
  browser = await chromium.launch();
  ({ page, close } = await openHarness(browser, await figureHarness(entry)));
  claims = await page.evaluate(() => [...document.querySelectorAll(".oak-answer__point")].map(node => node.textContent.trim()).filter(Boolean));
});
after(async () => { await close?.(); await browser?.close(); });

const bodies = async () => (await page.evaluate(() => window.sent())).map(body => JSON.parse(body));

test("14b a forced render error reports the failing component and render-error, and what the visitor sees does not change", async () => {
  assert.equal(await page.locator('[data-case="render"] .oak-openui-answer').count(), 0, "the plain answer replaces the crashed layout");
  const render = (await bodies()).filter(body => body.reason === "render");
  assert.equal(render.length, 2, "one report per crashed answer (mounted settled, and streamed then settled)");
  assert.deepEqual(Object.keys(render[0]).sort(), ["code", "component", "event", "reason", "tabId"]);
  assert.deepEqual({ ...render[0], tabId: undefined }, { event: "openui-fallback", tabId: undefined, reason: "render", component: "Timeline", code: "render-error" });
});

test("110 a crashed settled block leaves every claim of the answer visible, and a crash while streaming swaps nothing", async () => {
  const shown = await page.locator('[data-case="render"] .oak-answer__point').allTextContents();
  assert.equal(shown.length, 3, "the plain answer shows all three claims");
  assert.deepEqual(shown.map(text => text.trim()), claims.slice(0, 3));
  assert.equal(await page.locator('[data-case="streaming"] .oak-openui-answer').count(), 1, "a streaming layout stays");
  assert.equal((await bodies()).filter(body => body.reason === "render").length, 2, "the streaming crash reports nothing; the settled ones one each");
});

test("110 a block that crashes while streaming and still crashes once settled swaps in the plain answer and reports once", async () => {
  assert.equal(await page.locator('[data-case="settles"] .oak-openui-answer').count(), 0, "the plain answer replaces the crashed layout");
  assert.equal(await page.locator('[data-case="settles"] .oak-answer__point').count(), 3, "all three claims show");
});

test("14b a parse fallback names the first failing registered component with its code, and an unregistered name sends the code alone", async () => {
  const parse = (await bodies()).filter(body => body.reason === "parse").map(({ tabId, ...rest }) => rest);
  assert.deepEqual(parse.sort((a, b) => String(a.code).localeCompare(String(b.code))), [
    { event: "openui-fallback", reason: "parse", component: "TimelineItem", code: "missing-required" },
    { event: "openui-fallback", reason: "parse", code: "unknown-component" },
  ]);
});

test("14b no report carries claim text, an error message or a made-up name", async () => {
  const raw = (await page.evaluate(() => window.sent())).join("\n");
  assert.ok(claims.length, "the plain answers show their claims");
  for (const text of [...claims, "PRIVATE", "crash message", "Zq1", "September", "claim-"]) assert.ok(!raw.includes(text), `a report carries "${text.slice(0, 40)}"`);
  for (const body of await bodies()) assert.ok(new TextEncoder().encode(JSON.stringify(body)).byteLength <= 256, "each body fits the 256-byte cap");
});

// r110b: the settle remount must cost a healthy live answer nothing a visitor sees: no replayed entrance, focus kept.
const healthy = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { OakArrangedAnswer } from "@/components/agent/OakOpenUIAnswer";
import states from "@/data/dev/oak-states.json";
const settled = (states as any[]).find(state => state.id === "answer-openui-settled").workspace.messages[1];
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", operations: [], characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", ...settled.answer };
const root = createRoot(document.getElementById("root")!);
const draw = (ui: any) => root.render(<section><OakArrangedAnswer id="h" answer={answer as any} ui={ui} live latest question="Q" /></section>);
draw({ ...settled.ui, status: "streaming" });
Object.assign(window, { settle: () => draw(settled.ui), drawProgram: (program: string, status: string) => draw({ ...settled.ui, program, status }) });
document.documentElement.dataset.ready = "true";
`;

test("110 a healthy live answer keeps its focus and does not replay its entrance when it settles", async () => {
  const solo = await chromium.launch();
  const { page: view, close: shut } = await openHarness(solo, await figureHarness(healthy));
  try {
    await view.addStyleTag({ content: readFileSync(path.join(repo, "src/styles/openui/shared.css"), "utf8") });
    await view.waitForTimeout(600);
    const label = await view.evaluate(() => { const control = document.querySelector(".oak-openui-answer button, .oak-openui-answer a[href]"); control.focus(); return control.textContent; });
    await view.evaluate(() => window.settle());
    await view.waitForTimeout(30);
    const after = await view.evaluate(() => ({
      focused: document.activeElement?.closest(".oak-openui-answer") ? document.activeElement.textContent : null,
      replaying: document.getAnimations().filter(animation => animation.animationName === "oak-openui-in" && animation.playState === "running").length,
    }));
    assert.equal(after.focused, label, "focus stays on the same control");
    assert.equal(after.replaying, 0, "no entrance replays at settle");
  } finally {
    await shut();
    await solo.close();
  }
});

// Ticket 116 (r110 review r3): the settle remount's focus and entrance edges.
const ORDER = {
  streaming: 'root = Answer([h, t, p, src, next])\nh = Heading("In order")\nt = Timeline([a, b])\na = TimelineItem("September to December 2025", "claim-1")\nb = TimelineItem("January 30, 2026", "claim-2")\np = Prose("claim-3")\nsrc = Sources()\nnext = Pills(["What did EcoSmartLoop ship?", "What is Agentic Brain about?"])',
};
ORDER.reordered = ORDER.streaming.replace("[h, t, p, src, next]", "[h, p, t, src, next]");
ORDER.early = 'root = Answer([h, p])\nh = Heading("In order")\np = Prose("claim-3")';
const settleHarness = async (run, { reducedMotion = false } = {}) => {
  const solo = await chromium.launch();
  const { page: view, close: shut } = await openHarness(solo, await figureHarness(healthy), { reducedMotion });
  try {
    await view.addStyleTag({ content: readFileSync(path.join(repo, "src/styles/openui/shared.css"), "utf8") });
    await view.waitForTimeout(600);
    await run(view);
  } finally {
    await shut();
    await solo.close();
  }
};

test("116 a click on blank space and then a settle leaves focus on the page body", async () => {
  await settleHarness(async view => {
    await view.evaluate(() => { document.querySelector(".oak-openui-answer button, .oak-openui-answer a[href]").focus(); });
    await view.evaluate(() => { document.activeElement.blur(); });
    await view.evaluate(() => window.settle());
    await view.waitForTimeout(30);
    assert.equal(await view.evaluate(() => document.activeElement === document.body), true, "focus stays where the visitor put it");
  });
});

test("116 a settled program that reorders its blocks refocuses the same control", async () => {
  await settleHarness(async view => {
    await view.evaluate(program => window.drawProgram(program, "streaming"), ORDER.streaming);
    await view.waitForTimeout(300);
    const focusOn = () => view.evaluate(() => { const chip = [...document.querySelectorAll(".oak-openui__prose .oak-source-chip__trigger")].at(-1); chip.focus(); return chip.closest(".oak-openui__prose").textContent; });
    const label = await focusOn();
    assert.match(label, /He put that training/);
    await view.evaluate(program => window.drawProgram(program, "done"), ORDER.reordered);
    await view.waitForTimeout(30);
    const after = await view.evaluate(() => document.activeElement?.closest(".oak-openui__prose")?.textContent ?? null);
    assert.equal(after, label, "focus is on the same control, not whatever sat at its old position");
  });
});

test("116 a block that first appears in the settled update runs its entrance, and one already on screen does not", async () => {
  await settleHarness(async view => {
    await view.evaluate(program => window.drawProgram(program, "streaming"), ORDER.early);
    await view.waitForTimeout(400);
    await view.evaluate(program => window.drawProgram(program, "done"), ORDER.streaming);
    await view.waitForTimeout(30);
    const entering = await view.evaluate(() => document.getAnimations().filter(animation => animation.animationName === "oak-openui-in" && animation.playState === "running")
      .map(animation => animation.effect.target.textContent.slice(0, 24)));
    assert.ok(entering.some(text => text.includes("September")), `the new Timeline fades in (${entering.join(" | ")})`);
    assert.ok(!entering.some(text => text.includes("In order") || text.includes("He put that")), `blocks already shown do not replay (${entering.join(" | ")})`);
  });
});
