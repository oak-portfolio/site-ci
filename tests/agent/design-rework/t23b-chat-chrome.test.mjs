import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// Ticket 23 part B (M5 chrome fixes): the quick-check notice, opaque bases under the brief header and the composer strip,
// Open again, the summary's spoken separators, a lighter skeleton, tool marks, the citation card's side, header popups at
// 390 and the source chip's label in name.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const source = file => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(600);
};
const withPage = async (run, viewport = { width: 1280, height: 800 }, options = {}) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, ...options });
    await page.addInitScript(() => document.addEventListener("click", event => { if (event.target.closest?.("a[href^='mailto:']")) event.preventDefault(); }));
    await run(page);
  } finally { await browser.close(); }
};
/** Pixels of a clip, so an opaque base can be proved by hiding what sits behind it. */
const shot = (page, clip) => page.screenshot({ clip, animations: "disabled" });

test("T23b-1 a failed or cancelled quick check is one notice row with one inset and a secondary pill", () => {
  const { OakVerificationNotice } = loadTsx("src/components/agent/OakTurnstile.tsx");
  assert.equal(typeof OakVerificationNotice, "function", "OakTurnstile exports the notice");
  const base = { token: null, passed: false, refused: false, failed: false, challenge: "idle", placeholder: false, attempt: 0 };
  const render = (turnstile, key = "site") => renderToStaticMarkup(createElement(OakVerificationNotice, { turnstileKey: key, turnstile: { ...base, ...turnstile } }));
  assert.equal(render({}), "", "nothing while the check is quiet");
  const failed = render({ failed: true, challenge: "dismissed" });
  assert.equal(failed.match(/class="oak-verification-notice"/g)?.length, 1, "failed and cancelled at once still make one row");
  assert.match(failed, /^<p class="oak-verification-notice" role="alert">/);
  assert.match(failed, /<span class="oak-verification-notice__text">The quick check could not finish\.<\/span>/);
  assert.match(failed, /<button[^>]*class="[^"]*ui-button--secondary[^"]*"[^>]*>Retry the check<\/button>/, "a secondary pill");
  assert.doesNotMatch(failed, /Finish the quick check/);
  const dismissed = render({ challenge: "dismissed", placeholder: true }, undefined);
  assert.match(dismissed, /^<p class="oak-verification-notice">/, "a cancel is not an alert");
  assert.match(dismissed, /<button[^>]*ui-button--secondary[^>]*>Finish the quick check to send<\/button>/);
  const composer = source("src/components/agent/OakComposer.tsx");
  assert.doesNotMatch(composer, /The quick check could not finish|Retry the check/, "the composer renders the notice, not its own lines");
  assert.match(composer, /<OakVerificationNotice turnstileKey=\{turnstileKey\} turnstile=\{turnstile\} \/>/);
  const css = source("src/styles/oakAgent.css");
  assert.match(css, /\.oak-verification-notice \{[^}]*padding-inline: var\(--oak-frame-inset\);/, "one inset, the message box's own");
});

test("T23b-2 the brief's sticky header is opaque through its own bottom edge once content passes under it", () => withPage(async page => {
  await open(page, "brief-summary-on");
  const clipOf = () => page.evaluate(() => { const r = document.querySelector(".oak-brief-editor .oak-panel-nav").getBoundingClientRect(); return { x: Math.round(r.left) + 60, y: Math.round(r.top), width: Math.round(r.width) - 120, height: Math.round(r.height) }; });
  await page.evaluate(async () => { document.querySelector(".oak-workspace__reading").scrollTop = 260; await new Promise(r => setTimeout(r, 500)); });
  const clip = await clipOf();
  const title = await page.evaluate(() => { const n = document.querySelector(".oak-brief-editor .oak-panel-nav h2, .oak-brief-editor .oak-panel-nav [class*=title]"); n.style.visibility = "hidden"; return true; });
  assert.ok(title);
  const withContent = await shot(page, clip);
  await page.evaluate(() => { for (const n of document.querySelectorAll(".oak-brief-editor > :not(.oak-workflow__heading)")) n.style.visibility = "hidden"; });
  const without = await shot(page, clip);
  assert.ok(withContent.equals(without), "what scrolls under the bar never shows through it");
}, { width: 390, height: 844 }));

test("T23b-3 the strip under the message box on a case page hides the page behind it", () => withPage(async page => {
  await page.goto(`${galleryUrl}/work/agentic-brain/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 300);
  await page.getByRole("button", { name: /Oak AI Agent/ }).first().click();
  await page.locator(".oak-workspace .oak-composer__surface").waitFor();
  await page.waitForTimeout(1500);
  const clip = await page.evaluate(() => { const s = document.querySelector(".oak-workspace .oak-composer__surface").getBoundingClientRect(); return { x: 40, y: Math.ceil(s.bottom) + 1, width: 310, height: Math.max(1, innerHeight - Math.ceil(s.bottom) - 2) }; });
  const withPageBehind = await shot(page, clip);
  await page.evaluate(() => { for (const n of document.querySelectorAll("body > :not(:has(.oak-workspace))")) n.style.visibility = "hidden"; document.querySelector("main")?.style.setProperty("visibility", "hidden"); });
  await page.waitForTimeout(300);
  const without = await shot(page, clip);
  assert.ok(withPageBehind.equals(without), "the case page does not show through the strip");
}, { width: 390, height: 844 }));

test("T23b-4 after the draft opens, the link becomes a secondary Open again and a second open says so", () => withPage(async page => {
  await open(page, "brief-sent-on");
  await page.locator(".oak-brief__sent").waitFor();
  const again = page.getByRole("link", { name: "Open again" });
  assert.equal(await again.count(), 1, "the link now reads Open again");
  assert.match(await again.getAttribute("class"), /ui-button--secondary/);
  assert.doesNotMatch(await again.getAttribute("class"), /ui-button--primary/);
  assert.equal(await again.getAttribute("aria-describedby"), "oak-brief-summary");
  await again.click();
  await page.waitForTimeout(150);
  assert.equal((await page.locator(".oak-brief__sent-line[role='status']").textContent()).trim(), "Email draft opened again");
  await page.locator("#oak-brief-text").fill("Hi Steve, a short note.");
  await page.waitForTimeout(150);
  assert.equal(await page.getByRole("link", { name: "Open email draft" }).count(), 1, "a changed draft is a fresh draft");
}));

test("T23b-5 the summary facts are spoken apart, not as one run-on", () => withPage(async page => {
  await open(page, "brief-summary-on");
  const snapshot = await page.locator("#oak-brief-summary").ariaSnapshot();
  assert.match(snapshot, /Goes to Steve ?, 1 public reference ?, \d+ characters ?, all editable/, snapshot);
}, { width: 390, height: 844 }));

/** A token or computed colour as its alpha over the panel: the agent's fills are white at a set strength. */
const alphaOf = text => { const m = text.match(/\/\s*([\d.]+)\)/) ?? text.match(/rgba\([^)]*,\s*([\d.]+)\)/); return m ? Number(m[1]) : 1; };
const skeleton = page => page.evaluate(() => {
  const mark = document.querySelector(".oak-openui-skel[data-pending] :is(.oak-openui-skel__mark, .oak-openui-card__bar)");
  const probe = document.createElement("i"); mark.parentElement.append(probe);
  const token = name => { probe.style.backgroundColor = `var(${name})`; return getComputedStyle(probe).backgroundColor; };
  const style = getComputedStyle(mark);
  return { fill: style.backgroundColor, image: style.backgroundImage, animation: style.animationName, bubble: token("--oak-bubble"), raised: token("--oak-raised") };
});

test("T23b-6 the streaming skeleton fill sits one step lighter: the shimmer starts at raised, the still fill above the bubble", async () => {
  await withPage(async page => {
    await open(page, "answer-openui-stats-streaming");
    const s = await skeleton(page);
    const stops = [...s.image.matchAll(/color\([^)]*\)|rgba?\([^)]*\)/g)].map(m => alphaOf(m[0]));
    assert.equal(stops[0], alphaOf(s.raised), `the shimmer's low stop is raised (${s.image})`);
    assert.ok(stops[1] > alphaOf(s.bubble), "its peak is above the bubble");
  }, { width: 390, height: 844 }, { reducedMotion: "no-preference" });
  await withPage(async page => {
    await open(page, "answer-openui-stats-streaming");
    const s = await skeleton(page);
    assert.equal(s.animation, "none", "reduced motion holds it still");
    assert.ok(alphaOf(s.fill) > alphaOf(s.bubble), `still fill ${s.fill} is lighter than the bubble ${s.bubble}`);
  }, { width: 390, height: 844 }, { reducedMotion: "reduce" });
});

test("T23b-7 every tool chip leads with a mark or a neutral glyph; Vercel AI SDK and YouTube take their marks", () => {
  const { oakToolMark } = loadTsx("src/lib/oakToolMarks.ts");
  assert.equal(oakToolMark("Vercel AI SDK"), "/assets/brand-icons/aisdk.png");
  assert.equal(oakToolMark("YouTube"), "/assets/brand-icons/youtube.png");
  const { ToolChip } = loadTsx("src/lib/openui/cards.tsx");
  const chip = item => renderToStaticMarkup(createElement(ToolChip, { item }));
  assert.match(chip("Go"), /^<li class="oak-openui-chip" data-glyph=""><svg data-icon="code" aria-hidden="true"><\/svg>Go<\/li>$/, "an unmarked tool gets the neutral glyph");
  assert.match(chip("Next.js"), /^<li class="oak-openui-chip" data-mark=""><img class="oak-openui-chip__mark"/);
  const registry = source("src/data/brandIconRegistry.ts");
  assert.match(registry, /youtube: \{[^}]*iconMode: "favicon",\s*assetPath: "\/assets\/brand-icons\/youtube\.png"/, "YouTube is a bundled brand, not a letter fallback");
  const manifest = JSON.parse(source("public/assets/brand-icons/manifest.json"));
  assert.equal(manifest.icons.youtube?.assetPath, "/assets/brand-icons/youtube.png");
  assert.match(source("src/styles/openui/cards.css"), /\.oak-openui-chip__glyph \{/);
});

test("T23b-8 the citation card opens below its chip, under the header and off the question bubble", () => withPage(async page => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await open(page, "answer-points");
    const chip = page.locator(".oak-source-chip__trigger").first();
    await chip.scrollIntoViewIfNeeded();
    await page.evaluate(() => { const r = document.querySelector(".oak-workspace__reading"); const c = document.querySelector(".oak-source-chip__trigger").getBoundingClientRect(); r.scrollTop += c.top - 200; });
    await page.waitForTimeout(300);
    await chip.click();
    await page.locator(".oak-source-popover").waitFor();
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => {
      const pop = document.querySelector(".oak-source-popover").getBoundingClientRect(), chip = document.querySelector(".oak-source-chip__trigger").getBoundingClientRect();
      const header = document.querySelector(".oak-workspace__header").getBoundingClientRect();
      const bubbles = [...document.querySelectorAll(".oak-turn__question")].map(n => n.getBoundingClientRect());
      return { top: pop.top, chipBottom: chip.bottom, headerBottom: header.bottom, overBubble: bubbles.some(b => b.bottom > pop.top && b.top < pop.bottom && b.right > pop.left && b.left < pop.right) };
    });
    assert.ok(box.top >= box.chipBottom, `${width}: below the chip (${box.top} vs ${box.chipBottom})`);
    assert.ok(box.top >= box.headerBottom, `${width}: below the header`);
    assert.equal(box.overBubble, false, `${width}: off the question bubble`);
    await page.keyboard.press("Escape");
  }
}));

test("T23b-9 the Contact and Account popups sit centred at 390 (Contact also at 320), and keep their trigger alignment at 1280", () => withPage(async page => {
  for (const [state, selector] of [["contact-menu", ".oak-contact__popup"], ["account-menu", ".ui-menu__popup:has(.oak-account-menu__identity)"]]) {
    // At 320 the header folds the account trigger away, so the gallery cannot open that menu there; Contact is checked at both.
    for (const width of state === "contact-menu" ? [390, 320] : [390]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, state);
      // Measured against the body, which leaves out the stable scrollbar gutter on <html> (15px on Linux CI); Base UI lays the popup out in that width.
      const gaps = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, document.body.clientWidth - r.right]; }, selector);
      assert.ok(Math.abs(gaps[0] - gaps[1]) <= 1, `${state} at ${width}: left ${gaps[0]} right ${gaps[1]}`);
      assert.ok(gaps[0] >= 16, `${state} at ${width}: a margin either side`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, state);
    const width = await page.evaluate(s => document.querySelector(s).getBoundingClientRect().width, selector);
    assert.ok(width <= 360, `${state} at 1280 keeps its own width (${width})`);
  }
}));

test("T23b-10 axe finds no label-in-name mismatch in the roles and projects states", () => withPage(async page => {
  const axe = source("node_modules/axe-core/axe.min.js");
  for (const state of ["answer-openui-roles", "answer-openui-projects"]) for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await open(page, state);
    await page.addScriptTag({ content: axe });
    const nodes = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["label-content-name-mismatch"] })).violations.flatMap(v => v.nodes.map(n => n.html)));
    assert.deepEqual(nodes, [], `${state} at ${width}`);
  }
  const name = await page.locator(".oak-source-chip__trigger").first().getAttribute("aria-label");
  assert.match(name, /^Sources: /, "the name still says what it opens");
}));
