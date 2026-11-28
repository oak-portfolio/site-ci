import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader, loadTsx, stubSets } from "../design-rework/load-tsx.mjs";

const { createElement } = React;
// Ticket 54: the drawn and Mermaid figures in a real browser at 390 and 1280 (moved from tests/agent/openui, which stays node-only).
const root = path.resolve(import.meta.dirname, "../../..");
const TYPES = ["sequence", "state", "journey", "gitGraph", "c4"];

const gallery = process.env.OAK_GALLERY_URL;
const ownGallery = gallery && (await fetch(`${gallery}/@fs${encodeURI(path.join(root, "src/components/ui/tooltip.tsx"))}`).then(response => response.ok, () => false));
test("at 390 every drawing keeps text at 12px or more, has no glow, and scrolls in its own labeled frame, never the page", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    for (const id of ["drawn", ...TYPES.map(type => `mermaid-${type.toLowerCase()}`)].map(name => `explainer-${name}`)) {
      await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForSelector(".oak-drawn__svg svg", { timeout: 15000 });
      const seen = await page.evaluate(() => {
        const frame = document.querySelector(".oak-drawn__svg"), svg = frame.querySelector("svg");
        const scale = Math.hypot(svg.getScreenCTM().a, svg.getScreenCTM().b);
        const sizes = [...svg.querySelectorAll("text")].filter(node => node.textContent.trim()).map(node => Math.round(parseFloat(getComputedStyle(node).fontSize) * scale * 10) / 10);
        const glow = [...svg.querySelectorAll("*")].filter(node => getComputedStyle(node).filter !== "none" || getComputedStyle(node).boxShadow !== "none").length;
        const html = document.documentElement;
        return { smallest: Math.min(...sizes), glow, sideways: html.scrollWidth - html.clientWidth, tab: frame.tabIndex, scrolls: frame.scrollWidth > frame.clientWidth, name: frame.getAttribute("aria-label"), overflow: getComputedStyle(frame).overflowX };
      });
      assert.ok(seen.smallest >= 12, `${id}: smallest text ${seen.smallest.toFixed(1)}px`);
      assert.equal(seen.glow, 0, `${id}: no glow or shadow on the drawing`);
      assert.ok(seen.sideways <= 0, `${id}: the page scrolls sideways by ${seen.sideways}px`);
      // 204 (m7 N1): the frame is a Tab stop only when it scrolls.
      assert.equal(seen.tab, seen.scrolls ? 0 : -1, `${id}: the frame takes keyboard focus only when it scrolls`);
      assert.ok(seen.name, `${id}: the frame has an accessible name`);
      assert.equal(seen.overflow, "auto", `${id}: an over-wide drawing scrolls inside its frame`);
    }
  } finally { await browser.close(); }
});

test("an over-wide drawing fades the edge it continues past, and the fade leaves at the end and under forced colors", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const edges = page => page.evaluate(() => {
    const frame = document.querySelector(".oak-drawn__svg");
    return { wider: frame.scrollWidth > frame.clientWidth, start: frame.hasAttribute("data-more-start"), end: frame.hasAttribute("data-more-end"), mask: getComputedStyle(frame).maskImage };
  });
  const open = async (page, id) => {
    await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".oak-drawn__svg svg", { timeout: 30000 });
  };
  try {
    const narrow = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await open(narrow, "explainer-mermaid-sequence");
    await narrow.waitForSelector(".oak-drawn__svg[data-more-end]", { timeout: 5000 }).catch(() => {});
    let seen = await edges(narrow);
    assert.ok(seen.wider, "the sequence drawing is wider than its frame at 390");
    assert.deepEqual([seen.start, seen.end], [false, true], "more lies to the right only");
    assert.notEqual(seen.mask, "none", "the right edge fades");
    await narrow.evaluate(() => { const frame = document.querySelector(".oak-drawn__svg"); frame.scrollLeft = frame.scrollWidth; });
    await narrow.waitForFunction(() => !document.querySelector(".oak-drawn__svg").hasAttribute("data-more-end"), null, { timeout: 5000 }).catch(() => {});
    seen = await edges(narrow);
    assert.deepEqual([seen.start, seen.end], [true, false], "at the end only the left edge fades");
    await narrow.emulateMedia({ forcedColors: "active" });
    assert.equal((await edges(narrow)).mask, "none", "no fade under forced colors");
    const wide = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(wide, "explainer-mermaid-sequence");
    seen = await edges(wide);
    assert.deepEqual([seen.wider, seen.start, seen.end, seen.mask], [false, false, false, "none"], "a drawing that fits has no fade");
  } finally { await browser.close(); }
});

// Ticket 187: at 390 each wide drawing either fits its frame or says it scrolls, its first label shows whole, and the only Tab stop is readable.
test("at 390 each wide drawing fits or shows a scroll cue, shows its first label whole, and keeps no Tab stop inside aria-hidden", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const id of ["explainer-drawn", "explainer-mermaid-sequence", "explainer-mermaid-journey", "explainer-mermaid-gitgraph"]) {
        await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".oak-drawn__svg svg", { timeout: 30000 });
        await page.waitForTimeout(300);
        const seen = await page.evaluate(() => {
          const frame = document.querySelector(".oak-drawn__svg"), box = frame.getBoundingClientRect();
          const labels = [...frame.querySelectorAll("svg text")].filter(node => node.textContent.trim()).map(node => node.getBoundingClientRect());
          const first = labels.reduce((left, rect) => rect.left < left.left ? rect : left);
          const cue = document.querySelector(".oak-drawn__cue");
          const focusable = "a[href], button, input, select, textarea, [tabindex]";
          const hidden = [...document.querySelectorAll(".oak-figure [aria-hidden=true]")].flatMap(node => [...node.querySelectorAll(focusable), ...(node.matches(focusable) ? [node] : [])])
            .filter(node => node.tabIndex >= 0);
          const caption = frame.closest(".oak-figure").querySelector("figcaption").textContent;
          return { fits: frame.scrollWidth <= frame.clientWidth, cue: Boolean(cue && cue.getClientRects().length && cue.textContent.trim()),
            firstWhole: first.left >= box.left - 0.5 && first.right <= box.right + 0.5, hidden: hidden.length, name: frame.getAttribute("aria-label"), caption, tab: frame.tabIndex,
            scrolls: frame.scrollWidth > frame.clientWidth, inHidden: Boolean(frame.closest("[aria-hidden=true]")) };
        });
        const where = `${id} at ${width}`;
        assert.ok(seen.fits || seen.cue, `${where}: the drawing fits its frame or shows a scroll cue`);
        if (seen.fits) assert.equal(seen.cue, false, `${where}: a drawing that fits shows no cue`);
        assert.ok(seen.firstWhole, `${where}: the first label sits whole inside the frame`);
        assert.equal(seen.hidden, 0, `${where}: no focusable element inside an aria-hidden subtree`);
        assert.deepEqual([seen.tab, seen.inHidden, seen.name], [seen.scrolls ? 0 : -1, false, seen.caption], `${where}: the frame is named by the caption and a Tab stop only when it scrolls`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

// Review 187 F1: Tab scrolls the frame to the transcript's bottom edge, so the hint must still show, clear of the composer and the fade.
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
function channel(value) { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
async function contrast(page, rect) {
  const sharp = (await import("sharp")).default;
  const png = await page.screenshot({ clip: { x: rect.x, y: rect.y, width: Math.min(rect.width, 240), height: rect.height } });
  const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const shades = [];
  for (let index = 0; index < data.length; index += 3) shades.push(luminance([data[index], data[index + 1], data[index + 2]]));
  shades.sort((a, b) => a - b);
  const [back, fore] = [shades[Math.floor(shades.length * 0.5)], shades[Math.floor(shades.length * 0.995)]];
  return (fore + 0.05) / (back + 0.05);
}

test("at 390 a keyboard user who Tabs onto a wide drawing sees its scroll hint whole, clear of the composer and the fade, at 4.5:1", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const height of [664, 844]) {
      const page = await browser.newPage({ viewport: { width: 390, height } });
      for (const id of ["explainer-mermaid-sequence", "explainer-mermaid-journey"]) {
        await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
        await page.waitForSelector(".oak-drawn__svg[data-more-end] svg", { timeout: 30000 });
        await page.evaluate(() => { document.querySelector(".oak-conversation__viewport").scrollTop = 0; document.querySelector(".oak-figure__head button").focus(); });
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);
        const seen = await page.evaluate(() => {
          const viewport = document.querySelector(".oak-conversation__viewport"), cue = document.querySelector(".oak-drawn__cue");
          const style = getComputedStyle(viewport), px = name => parseFloat(style.getPropertyValue(name)) || 0;
          const below = px("--oak-reading-clear") + px("--oak-reading-fade-bottom"), above = px("--oak-reading-fade-top");
          const area = viewport.getBoundingClientRect(), rect = cue.getBoundingClientRect(), composer = document.querySelector(".oak-composer")?.getBoundingClientRect();
          return { focused: document.activeElement?.classList.contains("oak-drawn__svg"), shown: cue.getClientRects().length > 0 && getComputedStyle(cue).visibility === "visible",
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, top: area.top + above, bottom: Math.min(area.bottom - below, composer?.top ?? Infinity) };
        });
        const where = `${id} at 390x${height}`;
        assert.ok(seen.focused, `${where}: Tab from Show as list lands on the frame`);
        assert.ok(seen.shown, `${where}: the hint shows while more lies to the right`);
        assert.ok(seen.rect.y >= seen.top - 0.5 && seen.rect.y + seen.rect.height <= seen.bottom + 0.5,
          `${where}: the hint (${Math.round(seen.rect.y)} to ${Math.round(seen.rect.y + seen.rect.height)}) sits inside the clear conversation area (${Math.round(seen.top)} to ${Math.round(seen.bottom)})`);
        const ratio = await contrast(page, seen.rect);
        assert.ok(ratio >= 4.5, `${where}: the hint reads at ${ratio.toFixed(2)}:1`);
        const tall = () => page.evaluate(() => document.querySelector(".oak-figure").getBoundingClientRect().height);
        const before = await tall();
        await page.evaluate(() => { const frame = document.querySelector(".oak-drawn__svg"); frame.scrollLeft = frame.scrollWidth; });
        await page.waitForFunction(() => !document.querySelector(".oak-drawn__svg").hasAttribute("data-more-end"), null, { timeout: 5000 });
        assert.equal(await tall(), before, `${where}: the figure keeps its height when the hint leaves at the end`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test("at 390 a click or tap on a wide drawing does not move the transcript (r187b N1)", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
    for (const id of ["explainer-mermaid-sequence", "explainer-mermaid-journey"]) {
      await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForSelector(".oak-drawn__svg[data-more-end] svg", { timeout: 30000 });
      // Scroll so the hint sits above the clear area, as in the r187b repro, then click inside the frame.
      const start = await page.evaluate(() => {
        const viewport = document.querySelector(".oak-conversation__viewport"), cue = document.querySelector(".oak-drawn__cue");
        viewport.scrollTop += cue.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top + 8;
        return viewport.scrollTop;
      });
      const box = await page.locator(".oak-drawn__svg").boundingBox();
      await page.mouse.click(box.x + box.width / 2, Math.max(box.y + 20, 120));
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({ top: document.querySelector(".oak-conversation__viewport").scrollTop, focused: document.activeElement?.classList.contains("oak-drawn__svg") }));
      assert.ok(after.focused, `${id}: the click focuses the frame`);
      assert.ok(Math.abs(after.top - start) <= 1, `${id}: the transcript stays put on click (moved ${Math.round(after.top - start)}px)`);
    }
    await page.close();
  } finally { await browser.close(); }
});

test("a figure without frame renders the same markup as before ticket 187", () => {
  const { OakFigure } = loadTsx("src/lib/openui/figure/OakFigure.tsx");
  const listed = renderToStaticMarkup(createElement(OakFigure, { caption: "Bars", items: [{ label: "A", value: "1" }] }, createElement("svg", { role: "img" })));
  const bare = renderToStaticMarkup(createElement(OakFigure, { caption: "Bare", items: [] }, createElement("p", null, "x")));
  assert.equal(listed, `<figure class="oak-figure" aria-labelledby="_R_0_-caption" data-view="drawing"><div class="oak-figure__head"><figcaption id="_R_0_-caption" class="oak-figure__caption">Bars</figcaption><button type="button" tabindex="0" aria-pressed="false" aria-controls="_R_0_-list" class="ui-button ui-button--secondary ui-button--sm"><svg data-icon="checkList" aria-hidden="true"></svg>Show as list</button></div><div class="oak-figure__drawing" aria-hidden="true"><svg role="img"></svg></div><dl id="_R_0_-list" class="oak-figure__list sr-only"><div class="oak-figure__row"><dt>A</dt><dd>1</dd></div></dl></figure>`);
  assert.equal(bare, `<figure class="oak-figure" aria-labelledby="_R_0_-caption" data-view="drawing"><div class="oak-figure__head"><figcaption id="_R_0_-caption" class="oak-figure__caption">Bare</figcaption></div><div class="oak-figure__drawing"><p>x</p></div></figure>`);
});

test("r187 N2: at 390 a wide drawing's scroll hint is in place at first paint, so the frame never shifts", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const id of ["explainer-mermaid-sequence", "explainer-mermaid-gitgraph"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.addInitScript(() => {
        window.__shifts = [];
        new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push({ value: entry.value, figure: entry.sources.some(source => source.node?.closest?.(".oak-figure")) }); })
          .observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".oak-drawn__svg[data-more-end] svg", { timeout: 30000 });
      await page.waitForTimeout(800);
      const shift = await page.evaluate(() => window.__shifts.filter(entry => entry.figure).reduce((sum, entry) => sum + entry.value, 0));
      assert.equal(shift, 0, `${id}: the figure shifted by ${shift.toFixed(4)} after the drawing painted`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("r187 N3: a drawing with no list items keeps its SVG readable; one with items leaves the SVG to the list", () => {
  const figure = createLoader({ use: [stubSets.icons], interop: true, stubs: { react: { ...React, useState: init => [init && typeof init === "object" && "svg" in init ? { ...init, svg: "<svg><text>Visitor</text></svg>" } : init, () => {}] } } })("src/lib/openui/components/explainer/mermaid.tsx").MermaidFigure;
  const markup = items => renderToStaticMarkup(createElement(figure, { spec: { type: "sequence", title: "T", source: "sequenceDiagram", items }, label: "Sequence" }));
  const empty = markup([]);
  assert.match(empty, /role="group" aria-label="Sequence" data-judge-ok/, "the empty drawing still renders its named frame");
  assert.match(empty, /<div><svg><text>Visitor<\/text><\/svg><\/div>/, "with no list the SVG is not hidden");
  assert.doesNotMatch(empty, /aria-hidden="true"><svg><text/);
  assert.match(markup([{ label: "1", value: "Visitor asks" }]), /<div aria-hidden="true"><svg><text>Visitor<\/text><\/svg><\/div>/, "with a list the SVG is hidden behind it");
});

const DRAWN_STATES = ["explainer-drawn", "explainer-mermaid-sequence", "explainer-mermaid-state", "explainer-mermaid-journey", "explainer-mermaid-gitgraph",
  "explainer-mermaid-c4", "explainer-drawn-off"];

test("205 every explainer fixture's lead cites a project its bridge line names, and each drawing's title is about its topic", async () => {
  const { readFile } = await import("node:fs/promises");
  const states = JSON.parse(await readFile(path.join(root, "src/data/dev/oak-states/openui-explainer.json"), "utf8"));
  const { oakExplainerTopics } = loadTsx("src/data/oakExplainerTopics.ts");
  const wrong = [];
  for (const state of states) {
    const turn = state.workspace.messages.at(-1), [, topicId, preset, spec] = turn.ui.program.match(/Explainer\("([^"]+)"(?:, "([^"]+)")?(?:, "((?:[^"\\]|\\.)*)")?/) ?? [];
    const topic = oakExplainerTopics.find(row => row.id === topicId);
    if (!topic) continue;
    const bridge = [...topic.used, ...(topic.used.length ? [] : topic.related ? [topic.related] : [])].map(row => row.documentId);
    const cited = turn.answer.claims.flatMap(claim => claim.citations.map(citation => citation.documentId));
    if (bridge.length && !cited.some(id => bridge.includes(id))) wrong.push(`${state.id}: lead cites ${cited.join(",")}, bridge names ${bridge.join(",")}`);
    if (preset === "drawn" || preset === "mermaid") {
      const title = JSON.parse(`"${spec}"`).split("\n")[0].toLowerCase();
      const words = [...topic.keywords, ...topic.name.toLowerCase().split(/[^a-z]+/).filter(word => word.length > 3)];
      if (!words.some(word => new RegExp(`\\b${word}`).test(title))) wrong.push(`${state.id}: drawing "${title}" is not about ${topic.name}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("205 at 390 a drawn explainer's lead names the work its bridge line links", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const id of DRAWN_STATES) {
        await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".oak-explainer__bridge", { timeout: 30000 });
        const { lead, linked } = await page.evaluate(() => ({ lead: document.querySelector(".oak-turn__answer .oak-openui__prose")?.textContent ?? "",
          linked: [...document.querySelectorAll(".oak-explainer__bridge a")].map(link => link.textContent.trim()) }));
        assert.ok(linked.some(name => lead.includes(name)), `${id} ${width}: the lead "${lead.slice(0, 60)}" names one of ${linked.join(", ")}`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test("205 at 390 a Mermaid journey opens on its first task whole, not an actor beside a clipped card", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${gallery}/__dev/oak-states?state=explainer-mermaid-journey`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".oak-drawn__svg svg rect.task", { timeout: 30000 });
      await page.waitForTimeout(600);
      const first = await page.evaluate(() => {
        const frame = document.querySelector(".oak-drawn__svg"), task = frame.querySelector("rect.task");
        const f = frame.getBoundingClientRect(), t = task.getBoundingClientRect();
        return { left: Math.round(t.left - f.left), right: Math.round(t.right - f.left), width: Math.round(f.width) };
      });
      assert.ok(first.left >= 0 && first.right <= first.width, `${width}: the first task card sits whole in the frame (${first.left}..${first.right} of ${first.width})`);
      await page.close();
    }
  } finally { await browser.close(); }
});

// Ticket 237: under reduced motion Mermaid measured nodes before their transform landed, so the viewBox cut labels in half.
test("237 under reduced motion every drawn explainer figure keeps its content inside its viewBox at 390 and 1280", { skip: !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const states = ["drawn", ...TYPES.map(type => `mermaid-${type.toLowerCase()}`), "statediag", "xmap-agent-memory", "xrag", "xemb", "xtool", "xeval", "xgrad", "xoffsteps"].map(name => `explainer-${name}`);
  const outside = [];
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      for (const id of states) {
        await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
        await page.waitForSelector(".oak-explainer svg[viewBox], .oak-figure svg[viewBox], .oak-drawn__svg svg", { timeout: 15000 });
        await page.waitForTimeout(400);
        const boxes = await page.evaluate(() => [...document.querySelectorAll("svg[viewBox]")].filter(svg => svg.getBoundingClientRect().width > 0).map(svg => {
          const b = svg.getBBox(), v = svg.viewBox.baseVal;
          return { b: [b.x, b.y, b.width, b.height], v: [v.x, v.y, v.width, v.height] };
        }));
        assert.ok(boxes.length, `${id} at ${width}: draws a figure`);
        for (const { b: [x, y, w, h], v: [vx, vy, vw, vh] } of boxes) {
          if (x < vx - 0.5 || x + w > vx + vw + 0.5 || y < vy - 0.5 || y + h > vy + vh + 0.5) outside.push(`${id} at ${width}: content ${[x, y, w, h].map(n => n.toFixed(1))} leaves viewBox ${[vx, vy, vw, vh].map(n => n.toFixed(1))}`);
        }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(outside, [], outside.join("\n"));
});
