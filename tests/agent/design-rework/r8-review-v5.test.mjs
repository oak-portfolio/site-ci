import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Review v5 (Oak, 2026-10-19): seven flagged cells, each pattern held on every flow it touches.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(900);
};
const withPage = async (run, viewport = { width: 1280, height: 800 }) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport })); } finally { await browser.close(); }
};
const box = locator => locator.boundingBox();

test("Q24-G11 one footer row: Related on the left, the actions on the right, the related rows below it", () => withPage(async page => {
  await open(page, "answer-sourced");
  const footer = page.locator(".oak-turn__footer").last();
  const title = footer.locator(":scope > .oak-related__title");
  const actions = footer.locator(":scope > .oak-turn__actions");
  assert.equal(await title.count(), 1, "the Related title leads the action row");
  assert.equal(await actions.getByRole("button", { name: "Copy answer" }).count(), 1, "Copy sits in the right-hand group");
  const [t, a, f] = [await box(title), await box(actions), await box(footer)];
  assert.ok(Math.abs((t.y + t.height / 2) - (a.y + a.height / 2)) < 6, "title and actions share one row");
  assert.ok(t.x < a.x, "Related is left of the actions");
  assert.ok(Math.abs((a.x + a.width) - (f.x + f.width)) < 2, "the actions end at the row's right edge");
  const rows = page.locator(".oak-related.oak-related--rows").last();
  assert.equal(await rows.locator(".oak-related__title").count(), 0, "the rows below carry no second title");
  assert.equal(await rows.getAttribute("aria-labelledby"), await title.getAttribute("id"), "the rows are named by the row's title");
  assert.ok((await box(rows)).y >= f.y + f.height - 1, "the related rows sit below the action row");
}));

test("Q24-G11 every answer kind with actions keeps them on the right of the row", () => withPage(async page => {
  for (const state of ["answer-gap", "answer-document", "role-fit-answer", "answer-openui-settled", "answer-points"]) {
    await open(page, state);
    const footer = page.locator(".oak-turn__footer").last();
    assert.equal(await footer.count(), 1, `${state} has an action row`);
    const [a, f] = [await box(footer.locator(".oak-turn__actions")), await box(footer)];
    assert.ok(Math.abs((a.x + a.width) - (f.x + f.width)) < 2, `${state}: actions end at the right edge`);
  }
}));

test("Q24-G11 an arranged answer gives its label, body and source three different looks", () => withPage(async page => {
  await open(page, "answer-openui-settled");
  const style = (selector, props) => page.locator(selector).first().evaluate((node, keys) => {
    const s = getComputedStyle(node); return Object.fromEntries(keys.map(key => [key, s.getPropertyValue(key)]));
  }, props);
  const date = await style(".oak-openui__timeline-date", ["background-color", "color"]);
  const claim = await style(".oak-openui__timeline-claim", ["color"]);
  const chip = await style(".oak-openui__timeline-claim .oak-source-chip__trigger", ["background-color", "color"]);
  assert.equal(date["background-color"], "rgba(0, 0, 0, 0)", "the date is a label, not a pill");
  assert.notEqual(date.color, claim.color, "the date and the claim differ in colour");
  assert.notEqual(chip["background-color"], "rgba(0, 0, 0, 0)", "the source stays the one quiet pill");
  assert.notEqual(chip.color, claim.color, "the source is quieter than the claim");
}));

test("Q24-G11 the signed-in greeting is two lines: a quiet hello, then a plain title", () => withPage(async page => {
  await open(page, "empty-recruiter");
  const hello = page.locator(".oak-conversation__hello");
  const title = page.locator(".oak-conversation__empty > h2");
  assert.match(await hello.innerText(), /^Good (morning|afternoon|evening)|^Hello/);
  // R13 (intentional update, Oak v10): the Signed in badge left the hello line; the header avatar's ring says it.
  assert.equal(await hello.locator(".oak-conversation__signed-in").count(), 0);
  assert.equal(await title.locator(".oak-conversation__greeting").count(), 0, "the title holds no greeting");
  assert.equal(await title.evaluate(node => [node, ...node.querySelectorAll("*")].every(el => getComputedStyle(el).backgroundImage === "none")), true, "no gradient text");
  assert.ok((await box(title)).y > (await box(hello)).y + 8, "the title is its own line under the hello");
}));

test("Q24-G11 reasoning thoughts read quieter than the step titles, on a thin rule", () => withPage(async page => {
  await open(page, "reasoning-thoughts");
  const lum = color => { const [r, g, b, a = 1] = color.match(/[\d.]+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) * a; };
  const thought = await page.locator(".oak-cot__thought").first().evaluate(node => { const s = getComputedStyle(node); return { color: s.color, rule: s.borderInlineStartWidth }; });
  const titleColor = await page.locator(".oak-cot__step-title").first().evaluate(node => getComputedStyle(node).color);
  assert.ok(lum(thought.color) < lum(titleColor) * 0.7, `thought ${thought.color} is clearly quieter than title ${titleColor}`);
  assert.ok(parseFloat(thought.rule) >= 1, "the thought sits on a rule");
}));

test("Q24-G11 the window opens full screen edge to edge, nearly opaque, with the page behind blurred and desaturated, and a saved size from an earlier visit is ignored", () => withPage(async page => {
  await open(page, "answer-sourced");
  const workspace = page.locator(".oak-workspace");
  assert.equal(await workspace.getAttribute("data-expanded"), "true", "full screen by default");
  assert.equal(await workspace.getAttribute("data-full-screen"), "true");
  const surface = await workspace.evaluate(node => { const s = getComputedStyle(node), r = node.getBoundingClientRect();
    return { bg: s.backgroundColor, filter: s.backdropFilter, radius: s.borderTopLeftRadius, border: s.borderTopWidth, rect: [r.x, r.y, r.width, r.height].map(Math.round) }; });
  assert.deepEqual(surface.rect, [0, 0, 1440, 900], "Full fills the whole screen, not a floating popup");
  assert.equal(surface.radius, "0px", "no corners at full screen");
  assert.equal(surface.border, "0px", "no frame at full screen");
  // Oak, live: the page behind must read through. One layer at most 0.8, a light blur, no second dimming backdrop.
  const alpha = Number((surface.bg.match(/[\d.]+/g) ?? [])[3] ?? 1);
  assert.ok(alpha >= 0.6 && alpha <= 0.8, `the page reads through (${surface.bg})`);
  const blur = Number(surface.filter.match(/blur\((\d+)px/)?.[1] ?? 0);
  assert.ok(blur > 0 && blur <= 16, `a light blur (${surface.filter})`);
  assert.match(surface.filter, /saturate\(0?\.[3-7]\d*\)|saturate\([3-7]\d%\)/, `colour softened, not drained (${surface.filter})`);
  assert.equal(await page.locator(".oak-workspace__backdrop").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)", "no second dimming layer");
  await page.evaluate(() => localStorage.setItem("oak-workspace-frame-v1", JSON.stringify({ width: 540, height: 700 })));
  await open(page, "answer-sourced");
  assert.equal(await workspace.getAttribute("data-expanded"), "true", "a saved size from an earlier visit still opens full");
  await page.evaluate(() => localStorage.removeItem("oak-workspace-frame-v1"));
}, { width: 1440, height: 900 }));

test("Q24-G11 a full window keeps the transcript and composer in one centred reading column", () => withPage(async page => {
  await open(page, "answer-sourced");
  const [view, composer] = [await box(page.locator(".ui-message").last()), await box(page.locator(".oak-composer__surface"))];
  assert.ok(view.width <= 724 && composer.width <= 724, `column widths ${view.width} and ${composer.width} stay near 720`);
  assert.ok(Math.abs((view.x + view.width / 2) - 720) < 24, "the column is centred");
}, { width: 1440, height: 900 }));

// r8 review findings (evidence/r8-review.md): each one held by a check.
test("Q24-G11 panels share the full-screen column, and a phone keeps its own padding", async () => {
  await withPage(async page => {
    for (const state of ["contact-brief", "saved-list", "funding"]) {
      await open(page, state);
      const width = await page.locator(".oak-workspace__reading > :is(.oak-workflow, .oak-workspace__workflow)").first().evaluate(node => {
        const s = getComputedStyle(node); return node.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); });
      assert.ok(width <= 724, `${state}: panel content ${width}px stays in the 720px column`);
    }
  }, { width: 1440, height: 900 });
  await withPage(async page => {
    await open(page, "answer-sourced");
    const pad = await page.locator(".oak-conversation__content").evaluate(node => parseFloat(getComputedStyle(node).paddingLeft));
    assert.ok(pad <= 16, `a phone keeps its tighter side padding (${pad}px)`);
  }, { width: 390, height: 844 });
});

test("Q24-G11 an arranged answer's own follow-ups sit under its action row, titled by the row", () => withPage(async page => {
  await open(page, "answer-openui-settled");
  const footer = page.locator(".oak-turn__footer").last();
  const title = footer.locator(":scope > .oak-related__title");
  assert.equal(await title.count(), 1, "the row carries the Related title");
  const rows = page.locator(".oak-turn__pills-slot .oak-openui__pills");
  assert.equal(await rows.locator(".ui-suggestion").count(), 2, "the layout's pills moved under the row");
  assert.equal(await rows.locator(".oak-related__title").count(), 0, "no second title");
  assert.equal(await rows.getAttribute("aria-labelledby"), await title.getAttribute("id"));
  const [f, r] = [await box(footer), await box(rows)];
  assert.ok(r.y >= f.y + f.height - 1, "the rows sit below the action row");
}));

test("Q24-G11 at full screen every surface is a translucent layer and floating menus are frosted glass", () => withPage(async page => {
  const alpha = color => color === "transparent" ? 0 : Number((color.match(/[\d.]+/g) ?? [])[3] ?? 1);
  await open(page, "role-fit-answer");
  for (const selector of [".oak-role-review", ".oak-composer__surface", ".ui-message[data-align='end'] .ui-bubble"]) {
    const bg = await page.locator(selector).first().evaluate(node => getComputedStyle(node).backgroundColor);
    assert.ok(alpha(bg) < 0.3, `${selector} lets the window show through (${bg})`);
  }
  await open(page, "tools-menu");
  const menu = await page.locator(".ui-menu__popup").first().evaluate(node => { const s = getComputedStyle(node); return { bg: s.backgroundColor, filter: s.backdropFilter }; });
  assert.ok(alpha(menu.bg) >= 0.9 && alpha(menu.bg) < 1, `the menu is frosted, so text under it never competes (${menu.bg})`);
  assert.match(menu.filter, /blur\(/);
}, { width: 1440, height: 900 }));

test("Q24-G11 opening fades the window and staggers its parts in: header, then content, then the message box", () => withPage(async page => {
  await open(page, "empty");
  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__trace = []; const t0 = performance.now(); const tick = () => { const w = document.querySelector(".oak-workspace");
    if (w) { const o = s => Number(getComputedStyle(document.querySelector(s) ?? document.body).opacity); window.__trace.push({ t: performance.now() - t0, tf: getComputedStyle(w).transform, win: o(".oak-workspace"), head: o(".oak-workspace__header"), starters: o(".oak-conversation__starters"), composer: o(".oak-composer") }); }
    if (performance.now() - t0 < 900) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.getByRole("button", { name: /Oak AI Agent/ }).first().click();
  await page.waitForTimeout(1000);
  const trace = await page.evaluate(() => window.__trace);
  assert.ok(trace.length > 5, "frames were sampled");
  assert.ok(trace.every(frame => frame.tf === "none"), "the window never scales or slides, it only fades");
  const first = key => trace.find(frame => frame[key] > 0.5)?.t ?? Infinity;
  assert.ok(first("head") <= first("starters"), `the header lands before the content (${first("head")} vs ${first("starters")})`);
  assert.ok(first("starters") > first("win"), "the content follows the window's fade");
  assert.ok(trace.at(-1).composer === 1 && trace.at(-1).starters === 1, "everything settles");
}, { width: 1440, height: 900 }));
