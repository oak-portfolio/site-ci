import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { figureHarness, liveRegions, openHarness } from "./figure-helpers.mjs";

// A full answer (OakArrangedAnswer over the stored timeline program) beside the transcript's one region, a block that announces
// through announceOakBlock, and a view opened from a button that returns focus through useReturnFocus.
const entry = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { OakOutputAnnouncements } from "@/components/agent/OakTranscript";
import { OakArrangedAnswer } from "@/components/agent/OakOpenUIAnswer";
import { OakFigure } from "@/lib/openui/figure/OakFigure";
import { announceOakBlock } from "@/lib/openui/a11y/oakBlockAnnounce";
import { useReturnFocus } from "@/lib/openui/a11y/useReturnFocus";
import states from "@/data/dev/oak-states.json";

const settled = (states as any[]).find(state => state.id === "answer-openui-settled").workspace.messages[1];
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", operations: [], characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", ...settled.answer };
const messages = [{ id: "m1", role: "user", text: "Q", answer: null, cards: [], state: "complete", page: "/" }];

function Announcer() {
  return <button type="button" className="announce" onClick={() => announceOakBlock("m2:block-0", "Showing the figure as a list.")}>Announce</button>;
}

function Viewer({ opener, onClose }: { opener: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const view = useReturnFocus(opener, onClose);
  return <div {...view} role="dialog" aria-label="Viewer" className="viewer"><button type="button" className="inside" autoFocus onClick={onClose}>Close</button></div>;
}

function Opener() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLButtonElement>(null);
  return <>
    <button ref={ref} type="button" className="opener" onClick={() => setOpen(true)}>Open</button>
    {open ? <Viewer opener={ref} onClose={() => setOpen(false)} /> : null}
  </>;
}

let outerEscapes = 0;
document.addEventListener("keydown", event => { if (event.key === "Escape") outerEscapes++; });
Object.assign(window, { outerEscapes: () => outerEscapes });

createRoot(document.getElementById("root")!).render(<>
  <section className="answer"><OakArrangedAnswer id="m2" answer={answer as any} ui={settled.ui} latest={false} question="Q" citationLabels={{ knowledgeRevision: "k", documents: [] } as any} />
    <OakFigure caption="A figure" items={[{ label: "Row", value: "1" }]}><p>Row 1</p></OakFigure><Announcer /></section>
  <OakOutputAnnouncements messages={messages as any} />
  <Opener />
</>);
requestAnimationFrame(() => { document.documentElement.dataset.ready = "true"; });
`;

let browser, page, close;
before(async () => {
  browser = await chromium.launch();
  ({ page, close } = await openHarness(browser, await figureHarness(entry)));
});
after(async () => { await close?.(); await browser?.close(); });

test("live regions: a full rendered answer with a figure and an announcing block holds none, and the page holds the transcript's one", async () => {
  assert.ok(await page.locator(".answer .oak-openui-answer").count(), "the arranged answer rendered");
  assert.equal(await liveRegions(page.locator(".answer")), 0);
  assert.equal(await liveRegions(page), 1);
});

test("announceOakBlock: a block announcement reaches the transcript's polite region once per block", async () => {
  const region = page.locator("[role=status][aria-live=polite]");
  await page.locator(".announce").click();
  await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "Showing the figure as a list.");
  const before = await region.innerHTML();
  await page.locator(".announce").click();
  await page.waitForTimeout(100);
  assert.equal(await region.innerHTML(), before, "the same block saying the same thing again is dropped");
});

test("useReturnFocus: Escape closes the view and focus returns to the opener; Escape never reaches the workspace", async () => {
  await page.locator(".opener").click();
  await page.locator(".inside").waitFor();
  const outer = await page.evaluate(() => window.outerEscapes());
  await page.keyboard.press("Escape");
  await page.locator(".viewer").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.className), "opener");
  assert.equal(await page.evaluate(() => window.outerEscapes()), outer);
});

test("useReturnFocus: closing by unmount also returns focus to the opener", async () => {
  await page.locator(".opener").click();
  await page.locator(".inside").click();
  await page.locator(".viewer").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.className), "opener");
});

// r06 review repros: Escape stays with the focused view, focus returns only from inside it, and block lines posted together are said together.
const scoped = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { OakOutputAnnouncements } from "@/components/agent/OakTranscript";
import { announceOakBlock } from "@/lib/openui/a11y/oakBlockAnnounce";
import { useReturnFocus } from "@/lib/openui/a11y/useReturnFocus";
const w = window as any;
w.composerEscapes = 0; w.innerEscapes = 0;
function MountAnnouncer() { React.useEffect(() => { announceOakBlock("blk-mount", "Figure ready on mount."); }, []); return null; }
function Viewer({ opener, onClose, name }: any) {
  const view = useReturnFocus(opener, onClose);
  return <div {...view} className={"viewer viewer-" + name}><button type="button" className={"inside-" + name} onKeyDown={e => { if (e.key === "Escape") w.innerEscapes++; }}>in {name}</button></div>;
}
const user = { id: "u1", role: "user", text: "Q", answer: null, cards: [], state: "complete", page: "/" };
const pending = { id: "a1", role: "assistant", text: "", answer: null, cards: [], steps: [], state: "pending", page: "/" };
function App() {
  const [messages, setMessages] = React.useState<any[]>([user]);
  const [regionKey, setRegionKey] = React.useState(0);
  const [mountBlock, setMountBlock] = React.useState(false);
  const [openA, setOpenA] = React.useState(false), [openB, setOpenB] = React.useState(false), [showA, setShowA] = React.useState(true);
  const refA = React.useRef<HTMLButtonElement>(null), refB = React.useRef<HTMLButtonElement>(null);
  w.api = {
    sameTick: () => { setMessages([user, pending]); announceOakBlock("a1:block-0", "Figure ready."); },
    twoBlocks: () => { announceOakBlock("a1:block-1", "First block."); announceOakBlock("a1:block-2", "Second block."); },
    remountWithBlock: () => { setRegionKey(key => key + 1); setMountBlock(true); },
    announceMountTextAgain: () => announceOakBlock("blk-mount", "Figure ready on mount."),
    openA: () => setOpenA(true), openB: () => setOpenB(true), hideA: () => setShowA(false), closeA: () => setOpenA(false),
  };
  return <>
    <input className="composer" aria-label="Composer" onKeyDown={e => { if (e.key === "Escape") w.composerEscapes++; }} />
    <article data-message-id="a1"><p>Answer</p>{showA ? <button ref={refA} type="button" className="openerA">A</button> : null}</article>
    <button ref={refB} type="button" className="openerB">B</button>
    {openA ? <Viewer opener={refA} onClose={() => setOpenA(false)} name="a" /> : null}
    {openB ? <Viewer opener={refB} onClose={() => setOpenB(false)} name="b" /> : null}
    {mountBlock ? <MountAnnouncer /> : null}
    <OakOutputAnnouncements key={regionKey} messages={messages} />
  </>;
}
createRoot(document.getElementById("root")!).render(<App />);
requestAnimationFrame(() => { document.documentElement.dataset.ready = "true"; });
`;

const withScoped = async run => {
  const opened = await openHarness(browser, await figureHarness(scoped));
  try { await run(opened.page); assert.deepEqual(opened.errors, []); } finally { await opened.close(); }
};
const regionText = page => page.locator("[role=status]").textContent();
const settle = page => page.waitForTimeout(150);

test("useReturnFocus: Escape in an outside input reaches that input and leaves the view open", async () => {
  await withScoped(async page => {
    await page.evaluate(() => window.api.openA()); await settle(page);
    await page.locator(".composer").focus();
    await page.keyboard.press("Escape"); await settle(page);
    assert.deepEqual(await page.evaluate(() => ({ saw: window.composerEscapes, open: !!document.querySelector(".viewer-a"), active: document.activeElement.className })),
      { saw: 1, open: true, active: "composer" });
  });
});

test("useReturnFocus: with two views open one Escape closes only the focused one, and a handler inside it still sees Escape", async () => {
  await withScoped(async page => {
    await page.evaluate(() => { window.api.openA(); window.api.openB(); }); await settle(page);
    await page.locator(".inside-b").focus();
    await page.keyboard.press("Escape"); await settle(page);
    assert.deepEqual(await page.evaluate(() => ({ a: !!document.querySelector(".viewer-a"), b: !!document.querySelector(".viewer-b"), inner: window.innerEscapes, active: document.activeElement.className })),
      { a: true, b: false, inner: 1, active: "openerB" });
  });
});

test("useReturnFocus: a view closed while focus sits elsewhere keeps that focus; with its opener gone focus goes to the answer", async () => {
  await withScoped(async page => {
    await page.evaluate(() => window.api.openA()); await settle(page);
    await page.locator(".composer").focus();
    await page.evaluate(() => window.api.closeA()); await settle(page);
    assert.equal(await page.evaluate(() => document.activeElement.className), "composer");
    await page.evaluate(() => window.api.openA()); await settle(page);
    await page.locator(".inside-a").focus();
    await page.evaluate(() => window.api.hideA()); await settle(page);
    await page.evaluate(() => window.api.closeA()); await settle(page);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.messageId), "a1");
  });
});

test("block announce: a block line and a transcript unit in the same tick are said together, and so are two blocks", async () => {
  await withScoped(async page => {
    await page.evaluate(() => window.api.sameTick()); await settle(page);
    const both = await regionText(page);
    assert.ok(both.includes("Oak started on your question.") && both.includes("Figure ready."), both);
    await page.evaluate(() => window.api.twoBlocks()); await settle(page);
    assert.equal(await regionText(page), "First block. Second block.");
  });
});

test("block announce: a block that speaks on mount while the region remounts is not remembered, so it can speak later", async () => {
  await withScoped(async page => {
    await page.evaluate(() => window.api.remountWithBlock()); await settle(page);
    assert.equal(await regionText(page), "");
    assert.equal(await page.evaluate(() => window.api.announceMountTextAgain()), true);
    await settle(page);
    assert.equal(await regionText(page), "Figure ready on mount.");
  });
});
