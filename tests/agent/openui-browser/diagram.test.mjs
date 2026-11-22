import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { parse as parseYaml } from "yaml";
import { assertEquivalent, assertListSwitch, assertNoMotion, assertNoSidewaysScroll, figureHarness, openHarness, repo } from "./figure-helpers.mjs";

// Ticket 44: the drawing is inert (aria-hidden, nothing focusable), the list carries the text, and the detail panel below
// it is the keyboard surface: arrow keys, Home and End walk the steps in order and the selected node follows.
const systemMapOf = slug => parseYaml(readFileSync(path.join(repo, `src/content/work/${slug}.mdx`), "utf8").match(/^---\n([\s\S]*?)\n---/)[1]).systemMap;
const FIVE = systemMapOf("agentic-brain"), NINE = systemMapOf("oakminder");
const css = readFileSync(path.join(repo, "src/styles/openui/diagram.css"), "utf8");
const entry = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { DiagramFigure } from "@/lib/openui/components/diagram/DiagramFigure";
const style = document.createElement("style");
style.textContent = ${JSON.stringify(css)};
document.head.append(style);
const preset = new URLSearchParams(location.search).get("preset") ?? "flow";
createRoot(document.getElementById("root")!).render(<>
  <section className="five"><DiagramFigure name="Agentic Brain" preset="flow" steps={${JSON.stringify(FIVE)}} /></section>
  <section className="column" style={{ maxWidth: 720 }}><DiagramFigure name="Agentic Brain" preset="flow" steps={${JSON.stringify(FIVE)}} /></section>
  <section className="nine"><DiagramFigure name="OakMinder" preset="blockdiag" steps={${JSON.stringify(NINE)}} /></section>
</>);
const wait = () => document.querySelectorAll(".oak-diagram__node").length === ${2 * FIVE.length + NINE.length}
  && document.querySelectorAll(".oak-diagram__canvas[data-fitted]").length === 3
  ? (document.documentElement.dataset.ready = "true") : requestAnimationFrame(wait);
wait();
`;

let browser, harness;
before(async () => { browser = await chromium.launch(); harness = await figureHarness(entry); });
after(() => browser?.close());

const boxes = (page, scope) => page.locator(`${scope} .oak-diagram__node`).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const PAD = 12;
const crowded = (page, scope) => page.locator(`${scope} .oak-diagram__node`).evaluateAll((nodes, pad) => nodes.flatMap(node => {
  const box = node.getBoundingClientRect(), style = getComputedStyle(node);
  const inner = { top: box.top + parseFloat(style.borderTopWidth), bottom: box.bottom - parseFloat(style.borderBottomWidth),
    left: box.left + parseFloat(style.borderLeftWidth), right: box.right - parseFloat(style.borderRightWidth) };
  return [...node.children].flatMap(child => {
    const at = child.getBoundingClientRect(), gaps = [at.top - inner.top, inner.bottom - at.bottom, at.left - inner.left, inner.right - at.right];
    const clipped = child.matches(".oak-diagram__label") && child.scrollHeight > child.clientHeight + 0.5;
    return gaps.some(gap => gap < pad - 0.5) || clipped
      ? [`"${child.textContent}" sits ${gaps.map(Math.round).join("/")}px from its border`] : [];
  });
}), PAD);

for (const width of [1280, 390]) {
  test(`${width}: no node overlaps, every label keeps ${PAD}px from its border, nothing scrolls sideways, the list holds the drawing, the drawing has nothing focusable, axe is clean`, async () => {
    const { page, errors, close } = await openHarness(browser, harness, { width });
    try {
      for (const scope of [".five", ".column", ".nine"]) {
        const all = await boxes(page, scope);
        for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) assert.ok(!overlaps(a, b), `${scope} nodes overlap`);
        assert.deepEqual(await crowded(page, scope), [], `${scope} labels crowd their nodes`);
      }
      if (width === 390) for (const scope of [".five", ".column", ".nine"]) {
        const lefts = new Set((await boxes(page, scope)).map(box => Math.round(box.left)));
        assert.equal(lefts.size, 1, `${scope} turns vertical at 390`);
      } else assert.ok(new Set((await boxes(page, ".five")).map(box => Math.round(box.top))).size === 1, "five steps run in one row at 1280");
      await assertNoSidewaysScroll(page, "main");
      await assertEquivalent(page);
      assert.equal(await page.locator(".oak-figure__drawing :is(button, a, [tabindex])").count(), 0, "nothing in the aria-hidden drawing is focusable");
      const axe = await new AxeBuilder({ page }).include("main").analyze();
      assert.deepEqual(axe.violations.map(violation => `${violation.id} ${violation.nodes.map(node => node.target.join(" ")).join(", ")}`), []);
      assert.deepEqual(errors, []);
    } finally { await close(); }
  });
}

test("keys: arrows, Home and End walk the steps in order, the panel and the selected node follow; clicking a node selects it", async () => {
  const { page, close } = await openHarness(browser, harness, { width: 1280 });
  try {
    const scope = page.locator(".five");
    const title = () => scope.locator(".oak-diagram__panel-title").innerText();
    const selected = () => scope.locator(".oak-diagram__node[data-selected]").innerText();
    assert.equal(await title(), FIVE[0].label);
    await scope.getByRole("button", { name: "Next step" }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await title(), FIVE[1].label);
    assert.equal((await selected()).trim(), FIVE[1].label);
    await page.keyboard.press("ArrowDown");
    assert.equal(await title(), FIVE[2].label);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await title(), FIVE[1].label);
    await page.keyboard.press("End");
    assert.equal(await title(), FIVE.at(-1).label);
    assert.ok(await scope.getByRole("button", { name: "Next step" }).isDisabled());
    await page.keyboard.press("Home");
    assert.equal(await title(), FIVE[0].label);
    await scope.locator(".oak-diagram__node").nth(3).click();
    assert.equal(await title(), FIVE[3].label);
    assert.match(await scope.locator(".oak-diagram__panel").innerText(), new RegExp(FIVE[3].description.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await assertListSwitch(page);
  } finally { await close(); }
});

test("reduced motion: nothing animates", async () => {
  const { page, close } = await openHarness(browser, harness, { width: 390, reducedMotion: true });
  try { await assertNoMotion(page, "main"); } finally { await close(); }
});

test("forced colors: the selected node keeps a visible outline", async () => {
  const { page, close } = await openHarness(browser, harness, { width: 1280, forcedColors: true });
  try {
    const style = await page.locator(".five .oak-diagram__node[data-selected]").evaluate(node => getComputedStyle(node).outlineStyle);
    assert.notEqual(style, "none");
  } finally { await close(); }
});
