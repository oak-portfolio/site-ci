import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";
import { ownServer } from "../support/own-server.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const base = ownServer(process.env.OAK_GALLERY_URL ?? "http://localhost:4321");

const withPage = async (width, run) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport: { width, height: 800 } })); } finally { await browser.close(); }
};
const openState = async (page, state) => {
  await page.goto(`${base}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(1800);
};
/** The mechanical focus check: where focus sits now, and whether that is a dead place (the page body or a dialog root). */
const landing = page => page.evaluate(() => {
  const node = document.activeElement;
  const dead = !node || node === document.body || node.getAttribute("role") === "dialog" || node.matches(".oak-workspace, .ui-dialog__popup");
  return { dead, label: `${node?.tagName}.${String(node?.className).slice(0, 40)}#${node?.id}[${node?.getAttribute("aria-label") ?? node?.textContent?.slice(0, 24)}]` };
});
const dialogs = page => page.locator("[role=dialog]").count();

test("M5-K6 a streaming Timeline hides its list while it holds only skeletons", () => withPage(1280, async page => {
  await openState(page, "answer-openui-timeline-streaming");
  const lists = await page.evaluate(() => [...document.querySelectorAll("ol.oak-openui__timeline")].map(list => ({
    hidden: list.getAttribute("aria-hidden"), real: list.querySelectorAll(":scope > li:not(.oak-openui-skel)").length, skeletons: list.querySelectorAll(":scope > li.oak-openui-skel").length })));
  assert.ok(lists.some(list => list.real === 0 && list.skeletons > 0), "the fixture holds a skeleton-only list");
  for (const list of lists) assert.equal(list.hidden, list.real === 0 && list.skeletons > 0 ? "true" : null, JSON.stringify(list));
  await openState(page, "answer-openui-settled");
  assert.equal(await page.locator("ol.oak-openui__timeline[aria-hidden]").count(), 0, "a settled timeline stays in the tree");
}));

test("M5-K7 Metric and Stats announce each figure once", () => withPage(1280, async page => {
  for (const state of ["answer-openui-metric", "answer-openui-stats"]) {
    await openState(page, state);
    const figures = await page.evaluate(() => [...document.querySelectorAll(".oak-openui__metric-value")].map(node => node.querySelector("span")?.textContent?.trim() ?? ""));
    assert.ok(figures.length > 0 && figures.every(Boolean), `${state} shows figures`);
    const tree = await page.locator(".oak-openui__metric, .oak-openui-stats").first().ariaSnapshot();
    for (const figure of figures) assert.equal(tree.split(figure).length - 1, 1, `${state}: "${figure}" is read once in\n${tree}`);
  }
}));

test("M5-K8 an answer point is read once in browse mode, with no region named by its own claim", () => withPage(1280, async page => {
  for (const state of ["answer-points", "advice"]) {
    await openState(page, state);
    assert.equal(await page.locator(".oak-answer__point[aria-labelledby]").count(), 0, `${state}: no point is labelled by its own claim`);
    const tree = await page.locator(".oak-answer__point").first().ariaSnapshot();
    assert.doesNotMatch(tree, /^- region/, `${state}: ${tree}`);
  }
}));

test("M5-K9 the first Escape closes the Sources sheet and returns to its button", () => withPage(1280, async page => {
  await openState(page, "answer-points");
  await page.locator(".oak-answer__sources-button").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".oak-sources-panel");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Close sources", null, { timeout: 3000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".oak-sources-panel"), null, { timeout: 3000 });
  const after = await landing(page);
  assert.match(after.label, /oak-answer__sources-button/, after.label);
  assert.equal(await dialogs(page), 1, "the chat stays open");
}));

test("M5-K10 the first Escape on Copy answer closes the chat", () => withPage(1280, async page => {
  await openState(page, "answer-points");
  await page.getByRole("button", { name: "Copy answer" }).first().focus();
  // flip2: the ornament's Copy carries its name as visible text, so no tooltip opens; one Escape still closes the chat.
  assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Copy");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  assert.equal(await dialogs(page), 0, "one Escape closes the chat, the tooltip does not keep it");
}));

for (const width of [1280, 390]) {
  for (const [state, name] of [["empty", "Attach documents"], ["empty", "Tools"], ["empty", "Dictate a message"], ["empty", "Send"], ["answer-points", "Copy answer"]]) {
    test(`M5-K11 one Escape on ${name} with its tooltip open closes the chat at ${width}`, () => withPage(width, async page => {
      await openState(page, state);
      await page.getByRole("button", { name }).first().focus();
      if (name === "Copy answer") assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Copy", "the ornament labels Copy in text");
      else await page.waitForSelector(".ui-tooltip-content");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
      assert.equal(await dialogs(page), 0, "one Escape closes the chat, the tooltip does not keep it");
    }));
  }
}

test("M5-K12 a tooltip inside the contact menu still closes the menu with one Escape", () => withPage(1280, async page => {
  await openState(page, "empty");
  await page.locator("[data-oak-contact-trigger]").first().click();
  await page.waitForSelector(".oak-contact__copy");
  for (let step = 0; step < 6 && !(await page.evaluate(() => document.activeElement?.matches(".oak-contact__copy"))); step += 1) await page.keyboard.press("Tab");
  await page.waitForSelector(".ui-tooltip-content");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".oak-contact__copy"), null, { timeout: 3000 });
  assert.equal(await dialogs(page), 1, "the chat stays open, only the menu closed");
}));

test("M5-P0 the open mobile menu keeps Tab inside the header and makes main inert", () => withPage(390, async page => {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mobile-menu-button");
  await page.waitForTimeout(1500);
  await page.locator(".mobile-menu-button").focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#mobile-menu[data-open=true]");
  assert.ok(await page.locator("main").first().evaluate(node => Boolean(node.closest("[inert]"))), "main is inert while the menu is open");
  for (let step = 0; step < 14; step++) {
    await page.keyboard.press(step % 5 === 4 ? "Shift+Tab" : "Tab");
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest(".site-header")));
    assert.ok(inside, `Tab ${step + 1} left the header: ${await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`)}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForSelector("#mobile-menu", { state: "detached" });
  assert.ok(await page.locator("main").first().evaluate(node => !node.closest("[inert]")), "main wakes when the menu closes");
  assert.match((await landing(page)).label, /Open menu/, "Escape returns focus to the menu button");
}));

test("M5-P0b widening past 640 px closes the open mobile menu and wakes main", () => withPage(390, async page => {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mobile-menu-button");
  await page.waitForTimeout(1500);
  await page.locator(".mobile-menu-button").click();
  await page.waitForSelector("#mobile-menu[data-open=true]");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForSelector("#mobile-menu", { state: "detached", timeout: 3000 });
  assert.ok(await page.locator("main").first().evaluate(node => !node.closest("[inert]")), "main wakes after the viewport widens");
}));

test("M5-P1 Escape from the memory meter card returns focus to the meter", () => withPage(1280, async page => {
  await openState(page, "meter-memory-low");
  await page.locator(".oak-composer__meter").focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".oak-usage-card");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".oak-usage-card"), null, { timeout: 3000 });
  await page.waitForTimeout(700);
  const after = await landing(page);
  assert.match(after.label, /oak-composer__meter/, after.label);
  assert.equal(await dialogs(page), 1, "the chat stays open");
}));

test("M5-P3 the composer textbox draws its own keyboard focus ring", () => withPage(1280, async page => {
  await openState(page, "empty");
  await page.locator("#oak-composer-input").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.querySelector("#oak-composer-input")); return { matches: document.querySelector("#oak-composer-input").matches(":focus-visible"), style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }; });
  assert.ok(ring.matches, "the textbox is keyboard focused");
  assert.ok(ring.style !== "none" && ring.width >= 2, JSON.stringify(ring));
}));

test("M5-P5 Attach documents returns focus to its button on Escape and Back", () => withPage(1280, async page => {
  await openState(page, "empty");
  for (const leave of ["Escape", "Back"]) {
    await page.getByRole("button", { name: "Attach documents", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector(".oak-workflow h2");
    if (leave === "Escape") await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: "Return to chat" }).click();
    await page.waitForFunction(() => !document.querySelector(".oak-workflow"), null, { timeout: 3000 });
    const after = await landing(page);
    assert.ok(!after.dead && /Attach documents/.test(after.label), `${leave}: ${after.label}`);
  }
}));

test("M5-P6 Compare a role returns focus to the Tools button on Escape", () => withPage(1280, async page => {
  await openState(page, "empty");
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Compare a role" }).click();
  await page.waitForSelector(".oak-workflow h2");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".oak-workflow"), null, { timeout: 3000 });
  const after = await landing(page);
  assert.ok(!after.dead && /\[Tools\]/.test(after.label), after.label);
}));

test("M5-P7 the Sources sheet Close button, pressed with the pointer, lands focus on a control", () => withPage(1280, async page => {
  await openState(page, "answer-points");
  await page.locator(".oak-answer__sources-button").first().click();
  await page.waitForSelector(".oak-sources-panel");
  await page.getByRole("button", { name: "Close sources" }).click();
  await page.waitForFunction(() => !document.querySelector(".oak-sources-panel"), null, { timeout: 3000 });
  const after = await landing(page);
  assert.ok(!after.dead && /oak-answer__sources-button/.test(after.label), after.label);
}));

test("M5-P8 Turnstile gives focus back when its widget takes it while no check is showing", () => {
  const { keepFocusOutOfTurnstile } = loadTsx("src/components/agent/OakTurnstile.tsx");
  assert.equal(typeof keepFocusOutOfTurnstile, "function", "OakTurnstile exports its focus guard");
  const listeners = new Map();
  const widget = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  let interactive = false;
  const stop = keepFocusOutOfTurnstile(widget, () => interactive);
  const composer = { isConnected: true, focused: 0, focus() { this.focused++; } };
  const frame = { blurred: 0, blur() { this.blurred++; } };
  listeners.get("focusin")({ target: frame, relatedTarget: composer });
  assert.equal(composer.focused, 1, "focus goes back to where it was");
  listeners.get("focusin")({ target: frame, relatedTarget: null });
  assert.equal(frame.blurred, 1, "with nowhere to go, the widget lets go");
  interactive = true;
  listeners.get("focusin")({ target: frame, relatedTarget: composer });
  assert.equal(composer.focused, 1, "a check that needs the visitor keeps its focus");
  stop();
  assert.equal(listeners.size, 0, "the guard removes its listener");
});

test("M5-SH12 a stopped turn shows a status Marker that is read once", async () => {
  await withPage(1280, async page => {
    await openState(page, "interrupted");
    const marker = await page.evaluate(() => { const node = document.querySelector("[data-state=interrupted] [data-slot=marker]");
      return node ? { role: node.getAttribute("role"), live: node.getAttribute("aria-live"), text: node.textContent.trim() } : null; });
    assert.ok(marker, "the stopped card holds a Marker");
    assert.equal(marker.role, "status");
    assert.equal(marker.text, "Stopped");
    assert.equal(marker.live, "off", "the transcript's one live region speaks; the Marker is read in browse mode only");
  });
  const { collectOakOutputAnnouncements } = loadTsx("src/components/agent/OakTranscript.tsx");
  const turn = [{ id: "u", role: "user", text: "Q", cards: [] }, { id: "a", role: "assistant", text: "", cards: [], state: "interrupted" }];
  const announced = new Set();
  assert.match(collectOakOutputAnnouncements(turn, announced), /Answer stopped\./);
  assert.equal(collectOakOutputAnnouncements(turn, announced), "", "the stop is announced once");
});
