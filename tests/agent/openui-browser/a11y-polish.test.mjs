import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { ownServer } from "../support/own-server.mjs";

// Ticket 91: the m2 keyboard pass's F5, F6, F8 and F9. Needs this worktree's dev server (OAK_GALLERY_URL).
const base = ownServer(process.env.OAK_GALLERY_URL ?? "http://localhost:4321");
let browser;
before(async () => { browser = await chromium.launch(); });
after(() => browser?.close());

const withPage = async (width, run, media) => {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  if (media) await page.emulateMedia(media);
  try { await run(page); } finally { await context.close(); }
};
const openState = async (page, state) => {
  await page.goto(`${base}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(1500);
};
const openHome = async page => {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-oak-workspace-launcher]").waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
};
const focused = page => page.evaluate(() => {
  const node = document.activeElement;
  return { text: node?.textContent?.trim() ?? "", launcher: node?.hasAttribute("data-oak-workspace-launcher") ?? false,
    opacity: node ? getComputedStyle(node).opacity : "" };
});

for (const width of [1280, 390]) {
  test(`F5 at ${width}: a second skip link, hidden until focused, takes Enter to the launcher`, () => withPage(width, async page => {
    await openHome(page);
    const link = page.locator("a.skip-link", { hasText: "Skip to Oak AI Agent" });
    assert.equal(await link.count(), 1, "one skip link names the launcher");
    assert.equal(await link.evaluate(node => getComputedStyle(node).opacity), "0", "hidden before focus");
    await page.keyboard.press("Tab");
    assert.equal((await focused(page)).text, "Skip to main content", "the main-content skip link stays first");
    await page.keyboard.press("Tab");
    assert.equal((await focused(page)).text, "Skip to Oak AI Agent", "the launcher skip link is the second stop");
    await page.waitForTimeout(250);
    assert.equal((await focused(page)).opacity, "1", "shown while focused");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    assert.equal((await focused(page)).launcher, true, "Enter lands on the Oak AI Agent launcher");
    assert.equal(await page.locator("[data-oak-workspace-launcher]").count(), 1, "still one launcher");
  }));
}

test("F6: a mascot note sits in no live region", () => withPage(1280, async page => {
  await openHome(page);
  await page.locator(".oak-mascot__message").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(3000);
  const live = await page.locator(".oak-mascot__message").evaluateAll(nodes => nodes.map(node => {
    const region = node.closest("[aria-live]:not([aria-live=off]), [role=status], [role=log], [role=alert], [role=marquee], [role=timer]");
    return region ? `${region.tagName} ${region.getAttribute("aria-live") ?? region.getAttribute("role")}` : null;
  }));
  assert.ok(live.length > 0, "a note is on the page");
  assert.deepEqual(live.filter(Boolean), [], "no note is announced");
  assert.ok((await page.locator(".oak-mascot__message").first().textContent())?.trim(), "the note stays readable as text");
}));

for (const state of ["answer-openui-roles", "answer-openui-projects", "answer-openui-stack", "answer-openui-source", "answer-openui-source-gap",
  "profile-brief", "site-card-app", "project-wall-two", "ownership-split", "board-stand-2"]) {
  test(`F8: axe heading-order is clean in ${state}`, () => withPage(1280, async page => {
    await openState(page, state);
    const { violations } = await new AxeBuilder({ page }).withRules(["heading-order"]).analyze();
    assert.deepEqual(violations.flatMap(entry => entry.nodes.map(node => node.target.join(" "))), []);
  }));
}

test("F9: the streaming timeline says it is loading once, through the transcript's one region", () => withPage(1280, async page => {
  await openState(page, "answer-openui-timeline-streaming");
  const regions = await page.locator("[aria-live]:not([aria-live=off]), [role=status]").evaluateAll(nodes => nodes.map(node => node.textContent ?? ""));
  const said = regions.join(" ").split("Loading the timeline").length - 1;
  assert.equal(said, 1, `spoken once (regions: ${regions.map(text => text.slice(0, 60)).join(" | ")})`);
  assert.equal(await page.locator(".oak-openui__timeline [aria-live], .oak-openui__timeline [role=status]").count(), 0, "the block adds no region of its own");
}));

for (const width of [1280, 390]) {
  test(`F9 at ${width}: skeleton rows keep a visible mark in forced colors`, () => withPage(width, async page => {
    await openState(page, "answer-openui-timeline-streaming");
    const marks = await page.locator(".oak-openui__timeline .oak-openui-skel :is(.oak-openui-card__bar, .oak-openui-skel__mark)").evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node);
      return { outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0, border: style.borderTopStyle !== "none" && parseFloat(style.borderTopWidth) > 0 };
    }));
    assert.ok(marks.length > 0, "the state streams skeleton rows");
    assert.deepEqual(marks.filter(mark => !mark.outline && !mark.border), [], "every bar and node draws an edge");
  }, { forcedColors: "active" }));
}

const siteTile = page => page.locator(".oak-site[data-pending] .oak-site__tile").evaluateAll(nodes => nodes.map(node => {
  const style = getComputedStyle(node);
  const box = node.getBoundingClientRect();
  return { style: style.outlineStyle, width: style.outlineWidth, size: box.width > 0 && box.height > 0 };
}));

for (const width of [1280, 390]) {
  test(`255 at ${width}: the site card ghost's head tile keeps a 1px edge in forced colors`, () => withPage(width, async page => {
    await openState(page, "site-card-streaming");
    assert.deepEqual(await siteTile(page), [{ style: "solid", width: "1px", size: true }]);
  }, { forcedColors: "active" }));

  test(`255 at ${width}: outside forced colors the site card ghost's head tile draws no outline`, () => withPage(width, async page => {
    await openState(page, "site-card-streaming");
    assert.deepEqual((await siteTile(page)).map(tile => tile.style), ["none"]);
  }));
}
