import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Review v6 (Oak, 2026-10-20): 28 flagged cells and his live notes, each pattern held on every flow it touches.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(900);
};
const withPage = async (run, viewport = { width: 1280, height: 800 }, options = {}) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport, ...options })); } finally { await browser.close(); }
};

// Every reply kind Oak flagged for the gap: the reply starts within 40px of the question bubble, never an empty row.
const gapStates = ["answer-sourced", "answer-document", "answer-declined", "contact-handoff", "follow-ups", "interrupted", "failed",
  "model-busy", "answers-paused", "budget-paused", "server-unreachable", "answer-narrowing", "answer-proposal",
  "answer-openui-settled", "answer-openui-fallback", "answer-openui-proposal", "answer-openui-partial", "quota-reached", "quota-reached-guest"];

test("Q24-G16 a reply starts right under its question on every reply kind", () => withPage(async page => {
  for (const state of gapStates) {
    await open(page, state);
    const gap = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".oak-conversation__content [role=listitem]")];
      const last = items.findLastIndex(item => item.querySelector(".ui-message[data-align=end] .ui-bubble"));
      if (last < 0 || !items[last + 1]) return null;
      // Ticket 23 SH3 (intentional update): a send that never arrived ends its question with the Failed to send row.
      const bubble = (items[last].querySelector(".oak-turn__send-failed") ?? items[last].querySelector(".ui-bubble")).getBoundingClientRect();
      const reply = [...items[last + 1].querySelectorAll("*")].map(node => node.getBoundingClientRect()).filter(r => r.height > 0)
        .reduce((top, r) => Math.min(top, r.top), Infinity);
      return reply - bubble.bottom;
    });
    if (gap === null) continue;
    assert.ok(gap <= 40, `${state}: ${Math.round(gap)}px between the question and its reply`);
  }
}));

test("Q24-G16 the newest question's Edit sits beside its bubble, on the same row", () => withPage(async page => {
  await open(page, "answer-sourced");
  const question = page.locator(".oak-turn__question").last();
  const [bubble, edit] = [await question.locator(".ui-bubble").boundingBox(), await question.getByRole("button", { name: "Edit question" }).boundingBox()];
  assert.ok(edit.x + edit.width <= bubble.x + 1, "Edit is left of the bubble");
  assert.ok(edit.y < bubble.y + bubble.height && edit.y + edit.height > bubble.y, "Edit shares the bubble's row");
}));

test("Q24-G16 the sign-in card matches the message box's width", () => withPage(async page => {
  for (const state of ["sign-in", "sign-in-again", "sign-in-unavailable"]) {
    await open(page, state);
    const card = await page.locator(".oak-account-intake").boundingBox();
    const composer = await page.locator(".oak-composer__surface").first().boundingBox();
    assert.ok(Math.abs(card.x - composer.x) <= 2 && Math.abs(card.width - composer.width) <= 2, `${state}: card ${card.x}/${card.width} vs box ${composer.x}/${composer.width}`);
  }
}));

test("Q24-G16 the sign-in panel keeps the full reading column in Full (r9 review: never indented twice)", () => withPage(async page => {
  await open(page, "account-purpose");
  const width = await page.locator(".oak-account-intake").first().evaluate(node => {
    const s = getComputedStyle(node); return node.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); });
  assert.ok(width >= 700 && width <= 724, `panel content ${width}px fills the 720px column`);
}, { width: 1440, height: 900 }));

// R17 (intentional update, Oak on steveoak.com): the two rings merged into one meter that names both readings.
test("R17 one meter at the right reads answers left and conversation memory together", () => withPage(async page => {
  await open(page, "quota-reached-guest");
  const meters = page.locator(".oak-composer__meters");
  assert.equal(await meters.locator("button").count(), 1, "one meter, not two rings");
  const meter = meters.locator(".oak-composer__meter");
  assert.match(await meter.getAttribute("aria-label"), /^Answers left: .+ Conversation memory: \d+% full/);
  assert.equal(await meter.getAttribute("data-tone"), "out", "no answers left is the out tone");
  const allowance = await meter.boundingBox();
  const tools = await page.getByRole("button", { name: "Dictate a message" }).boundingBox();
  assert.ok(allowance.x > tools.x + tools.width + 100, "the meter sits at the right, away from the tools");
}));

test("Q24-G16 the header shows New conversation and no window size controls", () => withPage(async page => {
  await open(page, "answer-sourced");
  const header = page.locator(".oak-workspace__header");
  assert.equal(await header.getByRole("button", { name: "New conversation" }).count(), 1, "New conversation is a header action");
  assert.equal(await header.getByRole("button", { name: /^(Restore|Expand) window$/ }).count(), 0, "no Restore or Expand on the header");
  assert.equal(await header.getByRole("button", { name: "Window options" }).count(), 0, "no Window options: the window is always Full");
}));

test("Q24-G16 Full opens from the launcher with a reveal and a glow, then settles on a dark-to-glow background", () => withPage(async page => {
  await page.goto(`${galleryUrl}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Oak AI Agent" }).click();
  const workspace = page.locator(".oak-workspace");
  await workspace.waitFor();
  const opening = await workspace.evaluate(node => ({ entering: node.hasAttribute("data-entering"), animation: getComputedStyle(node).animationName,
    bloom: Boolean(node.querySelector(".oak-workspace__bloom")), x: node.style.getPropertyValue("--oak-open-x") }));
  assert.ok(opening.entering && opening.animation.includes("oak-window-reveal"), "the window grows out of the launcher");
  assert.ok(opening.bloom, "a glow blooms while it opens");
  assert.notEqual(opening.x, "", "the reveal starts at the launcher");
  await page.waitForTimeout(1400);
  const settled = await workspace.evaluate(node => ({ entering: node.hasAttribute("data-entering"), bloom: Boolean(node.querySelector(".oak-workspace__bloom")),
    background: getComputedStyle(node).backgroundImage, blur: getComputedStyle(node).backdropFilter }));
  assert.ok(!settled.entering && !settled.bloom, "the entrance clears");
  assert.match(settled.background, /radial-gradient[\s\S]*linear-gradient/, "a bottom glow over a dark top");
  assert.match(settled.blur, /blur/, "still a blurred see-through layer");
}));

test("Q24-G16 reduced motion opens Full without the reveal or the glow", () => withPage(async page => {
  await page.goto(`${galleryUrl}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Oak AI Agent" }).click();
  const workspace = page.locator(".oak-workspace");
  await workspace.waitFor();
  const state = await workspace.evaluate(node => ({ animation: getComputedStyle(node).animationName,
    bloom: node.querySelector(".oak-workspace__bloom") ? getComputedStyle(node.querySelector(".oak-workspace__bloom")).display : "none" }));
  assert.ok(!state.animation.includes("oak-window-reveal"), "no circle reveal");
  assert.equal(state.bloom, "none", "no glow");
}, { width: 1280, height: 800 }, { reducedMotion: "reduce" }));

test("Q24-G16 a panel's bar becomes a full-width soft fade when content scrolls under it", () => withPage(async page => {
  await open(page, "document-selected");
  await page.locator(".oak-workspace__reading").evaluate(node => { node.scrollTop = 200; });
  await page.waitForTimeout(400);
  const nav = page.locator(".oak-panel-nav");
  assert.notEqual(await nav.getAttribute("data-scrolled"), null, "the bar knows content is under it");
  const style = await nav.evaluate(node => {
    const bar = getComputedStyle(node), veil = getComputedStyle(node, "::before");
    return { bar: bar.backgroundColor, shadow: bar.boxShadow, veil: veil.opacity, width: Number.parseFloat(veil.width), image: veil.backgroundImage };
  });
  assert.equal(style.bar, "rgba(0, 0, 0, 0)", "the bar itself stays clear, no slab");
  assert.equal(style.shadow, "none", "no hard hairline");
  assert.equal(style.veil, "1", "the soft veil shows");
  assert.ok(style.width > 1280, "the veil spans the whole window, not the column");
  assert.match(style.image, /rgba\(7, 7, 7, 0\)\)$/, "the veil fades out at its bottom");
}));

test("Q24-G16 research source rows have room: corners and gaps a step up from the old 8px", () => withPage(async page => {
  await open(page, "research-sources");
  const card = page.locator(".oak-research__card").first();
  const [radius, gap] = [await card.evaluate(node => Number.parseFloat(getComputedStyle(node).borderTopLeftRadius)),
    await page.locator(".oak-research__cards").evaluate(node => Number.parseFloat(getComputedStyle(node).rowGap))];
  assert.ok(radius >= 14, `row radius ${radius}px`);
  assert.ok(gap >= 12, `row gap ${gap}px`);
}));

test("Q24-G16 a source shows a real picture or its name alone, never a stand-in initial or glyph", () => withPage(async page => {
  for (const state of ["answer-sources-web", "research-sources", "answer-sourced"]) {
    await open(page, state);
    const faces = await page.locator(".oak-source-face").evaluateAll(nodes => nodes.map(node => ({ face: node.dataset.face, img: Boolean(node.querySelector("img")) })));
    for (const face of faces) {
      assert.ok(["cover", "brand"].includes(face.face) && face.img, `${state}: a ${face.face} face without a picture`);
    }
  }
}));

test("Q24-G16 the larger-window note reads on its own card, above the launcher's glow and clear of Oak's bubble", () => withPage(async page => {
  await page.goto(`${galleryUrl}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Oak AI Agent" }).click();
  const note = page.locator(".oak-workspace__viewport-notice--entry");
  await note.waitFor();
  const style = await note.evaluate(node => ({ z: getComputedStyle(node).zIndex, background: getComputedStyle(node).backgroundColor }));
  assert.ok(Number(style.z) >= 1, "the note stacks above the glow");
  assert.match(style.background, /rgba\(17, 17, 17, 0\.9\d\)/, "a nearly solid card");
  const bubble = page.locator(".oak-mascot__bubble");
  if (await bubble.count()) assert.equal(await bubble.first().evaluate(node => getComputedStyle(node).visibility), "hidden", "Oak's bubble steps aside");
}, { width: 340, height: 640 }));
