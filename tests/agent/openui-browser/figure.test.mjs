import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { assertEquivalent, assertListSwitch, assertNoMotion, assertNoSidewaysScroll, assertNotColorAlone, figureHarness, openHarness, repo } from "./figure-helpers.mjs";

const states = JSON.parse(readFileSync(path.join(repo, "src/data/dev/oak-states/openui-figure.json"), "utf8"));
const figures = states.map(state => state.figure);

// The two gallery fixtures, then a figure whose view loads lazily through oakLazyView inside OpenUI's Renderer while it streams.
const entry = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";
import { z } from "zod";
import { OakFigure, OakFigureBars, oakFigureBarItems } from "@/lib/openui/figure/OakFigure";
import { oakLazyView } from "@/lib/openui/figure/oakLazyView";

let release: () => void = () => {};
const gate = new Promise<void>(resolve => { release = resolve; });
Object.assign(window, { releaseLazy: () => release() });
const Ghost = () => <p className="lazy-ghost">Loading the drawing</p>;
const Failed = () => <p className="lazy-failed">Drawing unavailable</p>;
const LazyDrawing = oakLazyView(() => gate.then(() => import("./lazy-view")), Ghost, Failed);
const BrokenDrawing = oakLazyView<{}>(() => Promise.reject(new Error("chunk gone")), Ghost, Failed);
const Lazy = defineComponent({ name: "Lazy", description: "lazy", props: z.object({ caption: z.string() }),
  component: ({ props }) => <OakFigure caption={props.caption} items={[{ label: "Lazy row", value: "1 loaded" }]}><LazyDrawing /></OakFigure> });
const library = createLibrary({ id: "lazy-probe", root: "Lazy", components: [Lazy] });
const figures = ${JSON.stringify(figures)};

createRoot(document.getElementById("root")!).render(<>
  {figures.map((data: any) => <OakFigure key={data.caption} caption={data.caption} items={oakFigureBarItems(data)}><OakFigureBars data={data} /></OakFigure>)}
  <section className="lazy-probe"><Renderer response={'root = Lazy("A streamed lazy figure")'} library={library} isStreaming={true} /></section>
  <section className="lazy-broken"><BrokenDrawing /></section>
</>);
requestAnimationFrame(() => { document.documentElement.dataset.ready = "true"; });
`;
const lazyView = `export default function LazyView() { return <p className="lazy-view">OAK_LAZY_VIEW_MARKER Lazy row 1 loaded</p>; }`;

let browser, harness;
before(async () => { harness = await figureHarness(entry, { "lazy-view.tsx": lazyView }); browser = await chromium.launch(); });
after(async () => browser?.close());

const withPage = async (options, run) => {
  const opened = await openHarness(browser, harness, options);
  try { await run(opened.page); assert.deepEqual(opened.errors, []); } finally { await opened.close(); }
};

test("figure: the two gallery fixtures are figures with a caption, a list equivalent holding every shown label and value, at 1280 and 390", async () => {
  assert.equal(figures.length, 2);
  for (const width of [1280, 390]) await withPage({ width }, async page => {
    await assertEquivalent(page, "main > figure.oak-figure");
    await assertNoSidewaysScroll(page, "main");
  });
});

test("figure: Show as list is a real toggle button and the list stays inside 390 when open", async () => {
  await withPage({ width: 390 }, async page => {
    await assertListSwitch(page);
    const toggle = page.locator(".oak-figure__head [aria-pressed]").first();
    const fill = () => page.mouse.move(0, 0).then(() => page.waitForTimeout(400)).then(() => toggle.evaluate(node => getComputedStyle(node).backgroundColor));
    const idle = await fill();
    await toggle.click();
    assert.notEqual(await fill(), idle, "pressed looks pressed outside forced colors");
    await assertNoSidewaysScroll(page, "main");
    assert.ok(await page.locator(".oak-figure__list").first().isVisible());
  });
});

test("figure: values read as 'Series: count' in the series' own casing, an all-zero row reads 0, and marks scroll with the page", async () => {
  const zero = await figureHarness(`
import { createRoot } from "react-dom/client";
import { OakFigure, OakFigureBars, oakFigureBarItems } from "@/lib/openui/figure/OakFigure";
const data = { caption: "Counts", series: ["Case study", "LinkedIn"], rows: [{ label: "A", values: [3, 1] }, { label: "B", values: [0, 0] }] };
createRoot(document.getElementById("root")!).render(<OakFigure caption={data.caption} items={oakFigureBarItems(data)}><OakFigureBars data={data} /></OakFigure>);
requestAnimationFrame(() => { document.documentElement.dataset.ready = "true"; });`);
  const opened = await openHarness(browser, zero);
  try {
    assert.deepEqual(await opened.page.locator(".oak-figure__row dd").allTextContents(), ["Case study: 3, LinkedIn: 1", "0"]);
    await assertEquivalent(opened.page);
    const attachments = await opened.page.locator(".oak-figure__mark").evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).backgroundAttachment))]);
    assert.ok(!attachments.includes("fixed"), attachments.join());
  } finally { await opened.close(); }
});

test("figure: in forced colors every series is told apart by pattern or shape, not color, and the figure keeps a visible edge", async () => {
  await withPage({ forcedColors: true }, async page => {
    for (const index of [0, 1]) await assertNotColorAlone(page, `main > figure.oak-figure >> nth=${index} >> .oak-figure__bar .oak-figure__mark`);
    await assertNotColorAlone(page, "main > figure.oak-figure >> nth=1 >> .oak-figure__legend .oak-figure__mark");
    const edge = await page.locator("figure.oak-figure").first().evaluate(node => getComputedStyle(node).borderTopStyle);
    assert.equal(edge, "solid");
    const inks = await page.locator(".oak-figure__mark").evaluateAll(nodes => {
      const probe = document.body.appendChild(Object.assign(document.createElement("i"), { style: "color: CanvasText; background: Canvas" }));
      const system = [getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor, "rgba(0, 0, 0, 0)"];
      probe.remove();
      return [...new Set(nodes.flatMap(node => `${getComputedStyle(node).backgroundColor} ${getComputedStyle(node).backgroundImage}`.match(/rgba?\([^)]*\)/g) ?? []))]
        .filter(color => !system.includes(color));
    });
    assert.deepEqual(inks, [], "every series draws in system colors only");
    assert.equal(await page.locator(".oak-figure__head [aria-pressed]").first().evaluate(node => getComputedStyle(node).borderTopStyle), "solid", "the switch keeps an edge");
  });
});

test("figure: reduced motion leaves no transition or animation in a figure", async () => {
  await withPage({ reducedMotion: true }, page => assertNoMotion(page, "main"));
});

test("figure: a figure with no equivalent leaves its drawing readable", async () => {
  const bare = await figureHarness(`
import { createRoot } from "react-dom/client";
import { OakFigure } from "@/lib/openui/figure/OakFigure";
createRoot(document.getElementById("root")!).render(<OakFigure caption="No list" items={[]}><p>Drawn words</p></OakFigure>);
requestAnimationFrame(() => { document.documentElement.dataset.ready = "true"; });`);
  const opened = await openHarness(browser, bare);
  try {
    await assertEquivalent(opened.page);
    assert.equal(await opened.page.locator(".oak-figure__head [aria-pressed]").count(), 0, "no switch without a list");
  } finally { await opened.close(); }
});

test("oakLazyView: OpenUI's streaming Renderer shows the ghost, then the lazy view, and the view is not in the first chunk", async () => {
  await withPage({}, async page => {
    const probe = page.locator(".lazy-probe");
    await probe.locator(".lazy-ghost").waitFor();
    assert.equal(await probe.locator(".lazy-view").count(), 0);
    await page.evaluate(() => window.releaseLazy());
    await probe.locator(".lazy-view").waitFor();
    assert.equal(await probe.locator(".lazy-ghost").count(), 0);
    await page.locator(".lazy-broken .lazy-failed").waitFor();
    assert.equal(await page.locator(".lazy-broken .lazy-ghost").count(), 0, "a failed load leaves the ghost for the consumer's fallback");
  });
  const first = harness.chunks.find(chunk => chunk.file === harness.entry);
  assert.ok(!first.text.includes("OAK_LAZY_VIEW_MARKER"), "the lazy view is outside the first chunk");
  assert.ok(harness.chunks.some(chunk => chunk.text.includes("OAK_LAZY_VIEW_MARKER")), "and lands in a chunk of its own");
});
