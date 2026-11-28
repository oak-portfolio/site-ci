import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 39 (gallery on OAK_GALLERY_URL): the viewer holds Tab, hides its caption and returns focus on Escape; reduced motion
// jumps between screens; every state fits 390; images ship AVIF first and are never cropped.
const STATES = ["screens-one", "screens-three", "screens-six", "screens-off-ratio", "screens-viewer", "screens-viewer-no-caption", "screens-streaming", "screens-off"];
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const inViewer = page => page.evaluate(() => Boolean(document.activeElement?.closest(".oak-screens-viewer")));

test("gallery: the viewer opens in place, holds Tab both ways, hides its caption, and Escape returns focus to the opener", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "screens-three", { settle: 400 });
    const opener = page.locator(".oak-screens__open").first();
    await opener.click();
    const viewer = page.getByRole("dialog", { name: "Orbi guidance UI" });
    await viewer.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close viewer", "focus lands on Close");
    for (let press = 0; press < 6; press++) { await page.keyboard.press("Tab"); assert.ok(await inViewer(page), `Tab ${press + 1} stays in the viewer`); }
    for (let press = 0; press < 6; press++) { await page.keyboard.press("Shift+Tab"); assert.ok(await inViewer(page), `Shift+Tab ${press + 1} stays in the viewer`); }
    const toggle = viewer.getByRole("button", { name: "Hide caption" });
    assert.equal(await viewer.locator("figcaption").count(), 1);
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.equal(await viewer.locator("figcaption").count(), 0, "caption hidden");
    await viewer.getByRole("button", { name: "Next screen" }).click();
    assert.equal(await page.locator(".oak-screens-viewer").getAttribute("aria-label"), "Behavior-loop media");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".oak-screens-viewer").count(), 0, "Escape closes the viewer");
    assert.equal(await opener.evaluate(node => node === document.activeElement), true, "focus returns to the screen that opened it");
  } finally { await browser.close(); }
});

test("gallery: reduced motion moves the frame to the next screen with no slide in between", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
    await openState(page, "screens-three", { settle: 400 });
    const track = page.locator(".oak-screens__viewport > ul");
    const before = await track.evaluate(node => getComputedStyle(node).transform);
    await page.getByRole("button", { name: "Next screen" }).first().click();
    const soon = await track.evaluate(node => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(getComputedStyle(node).transform)))));
    await page.waitForTimeout(600);
    const settled = await track.evaluate(node => getComputedStyle(node).transform);
    assert.notEqual(settled, before, "the frame moved");
    assert.equal(soon, settled, "two frames after the press the frame is already at rest");
    assert.equal(await page.locator(".oak-screens__thumb[aria-current='true']").getAttribute("aria-label"), "Show Behavior-loop media");
  } finally { await browser.close(); }
});

test("gallery: every state fits 1280 and 390, media is contained, generated images load AVIF, and off is the Source card", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const id of STATES) {
        await openState(page, id, { settle: 300 });
        assert.equal(await sideways(page), false, `${id}: no sideways scroll at ${width}`);
      }
      await openState(page, "screens-off-ratio", { settle: 800 });
      const media = await page.locator(".oak-screens__image").evaluateAll(nodes => nodes.map(node => ({ fit: getComputedStyle(node).objectFit, src: node.currentSrc })));
      assert.equal(media.length, 2);
      for (const item of media) assert.equal(item.fit, "contain", `${item.src} is never cropped`);
      assert.ok(media.some(item => item.src.endsWith(".avif")), `a generated image loads its AVIF: ${media.map(item => item.src).join(", ")}`);
      await openState(page, "screens-viewer-no-caption", { settle: 400 });
      assert.equal(await page.locator(".oak-screens-viewer figcaption").count(), 0);
      await openState(page, "screens-off", { settle: 300 });
      assert.equal(await page.locator(".oak-screens").count(), 0);
      assert.ok(await page.locator(".oak-openui-source").count() > 0, "constant off draws the Source card");
      await openState(page, "screens-streaming", { settle: 300 });
      assert.ok(await page.locator(".oak-screens[data-pending]").count() > 0, "the frame ghost while facts load");
      assert.equal(await page.getByText(/up next/i).count(), 0);
    }
  } finally { await browser.close(); }
});

const boxOf = (page, selector) => page.locator(selector).evaluateAll(nodes => nodes.map(node => { const { left, right, top, bottom, width, height } = node.getBoundingClientRect(); return { left, right, top, bottom, width, height }; }));

test("gallery: at 1280 and 390 the current screen sits centred with both neighbours peeking, and the side fades stay off it", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, "screens-three", { settle: 600 });
      await page.getByRole("button", { name: "Next screen" }).first().click();
      await page.waitForTimeout(1800);
      const [frame] = await boxOf(page, ".oak-screens__viewport");
      const [before, current, after] = await boxOf(page, ".oak-screens__slide");
      const fade = await page.locator(".oak-screens__viewport").evaluate(node => parseFloat(getComputedStyle(node).getPropertyValue("--oak-screens-fade")) / 100 * node.getBoundingClientRect().width);
      assert.ok(Math.abs((current.left - frame.left) - (frame.right - current.right)) < 2, `${width}: the current screen is centred`);
      assert.ok(current.left - frame.left >= fade && frame.right - current.right >= fade, `${width}: the fades (${fade}px) end before the current screen`);
      assert.ok(before.right > frame.left + 4 && after.left < frame.right - 4, `${width}: both neighbours peek into the frame`);
    }
  } finally { await browser.close(); }
});

test("gallery: at 390 the open viewer's bar clears the workspace header and the whole viewer fits on screen", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await openState(page, "screens-three", { settle: 600 });
    await page.locator(".oak-screens__open").first().click();
    await page.locator(".oak-screens-viewer").waitFor();
    await page.waitForTimeout(600);
    const [header] = await boxOf(page, ".oak-workspace__header, [data-oak-workspace-header], header");
    const [bar] = await boxOf(page, ".oak-screens-viewer__bar");
    const [nav] = await boxOf(page, ".oak-screens-viewer > .oak-screens__nav");
    assert.ok(bar.top >= header.bottom, `the bar (${bar.top}) sits below the header (${header.bottom})`);
    assert.ok(nav.bottom <= 844, `the viewer's arrows (${nav.bottom}) are on screen`);
  } finally { await browser.close(); }
});

test("gallery: each filmstrip thumbnail keeps its image's real ratio at one shared height", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "screens-off-ratio", { settle: 600 });
    const thumbs = await boxOf(page, ".oak-screens__thumb");
    assert.equal(thumbs.length, 2);
    assert.equal(thumbs[0].height, thumbs[1].height, "one height");
    assert.ok(Math.abs(thumbs[0].width / thumbs[0].height - 0.461) < 0.05, `the tall onboarding grid is tall: ${thumbs[0].width}x${thumbs[0].height}`);
    assert.ok(Math.abs(thumbs[1].width / thumbs[1].height - 1.336) < 0.05, `the studio shot is wide: ${thumbs[1].width}x${thumbs[1].height}`);
  } finally { await browser.close(); }
});
