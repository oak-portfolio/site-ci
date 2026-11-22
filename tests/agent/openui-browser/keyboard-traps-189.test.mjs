import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { galleryUrl, openState } from "../premium/gallery.mjs";

// Ticket 189 (gallery on OAK_GALLERY_URL): m5/m6 keyboard findings M5 (Turnstile layer), M6 (command palette), M1 (timeline lanes).
const widths = [1280, 390];
const where = () => {
  const node = document.activeElement;
  return { inside: Boolean(node?.closest("[role=dialog]")), name: `${node?.tagName} ${node?.getAttribute("aria-label") ?? node?.textContent?.trim().slice(0, 24) ?? ""}` };
};
const walk = async (page, key, presses = 30) => {
  const out = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key);
    out.push(await page.evaluate(where));
  }
  return out;
};
const outside = stops => stops.filter(stop => !stop.inside).map(stop => stop.name);
const visits = (stops, name) => stops.some(stop => stop.name.includes(name));
const openPalette = async (browser, width, options = {}) => {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, reducedMotion: "reduce", ...options });
  await context.route(/oakFlags\/commandPalette\.ts/, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("oakCommandPalette = false", "oakCommandPalette = true") });
  });
  const page = await context.newPage();
  await page.goto(`${galleryUrl}/`, { waitUntil: "networkidle" });
  const search = page.getByRole("button", { name: "Search pages, sections and projects" }).first();
  await search.focus();
  await page.keyboard.press("Enter");
  const field = page.getByRole("combobox", { name: "Search without asking" });
  await field.waitFor();
  await page.waitForTimeout(300);
  return { context, page, field };
};

test("ticket 192: the Turnstile layer, the palette and the header menu share one Tab wrap with one focusable selector", () => {
  const helper = readFileSync(new URL("../../../src/lib/oakFocusWrap.ts", import.meta.url), "utf8");
  assert.match(helper, /\[tabindex\]/, "the shared selector catches tabindex rows");
  for (const file of ["src/components/OakCommandPalette.tsx", "src/components/agent/OakTurnstile.tsx", "src/components/SiteHeader.tsx"]) {
    const source = readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
    assert.match(source, /from "@\/lib\/oakFocusWrap"/, `${file} uses the shared wrap`);
    assert.doesNotMatch(source, /a\[href\], button/, `${file} keeps no selector of its own`);
  }
});

test("r192 P2: focusStops leaves out disabled, fieldset-disabled, hidden and tabindex=-1 elements", async () => {
  const { transformSync } = await import("esbuild");
  const { code } = transformSync(readFileSync(new URL("../../../src/lib/oakFocusWrap.ts", import.meta.url), "utf8"), { loader: "ts", format: "iife", globalName: "wrap" });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="root"><button id="a">a</button><button id="d" disabled tabindex="0">d</button>
      <fieldset disabled><input id="f"></fieldset><input id="h" style="visibility:hidden"><input id="c" style="visibility:collapse"><div id="n" tabindex="-1">n</div>
      <button id="g" hidden>g</button><span style="display:none"><a id="x" href="#">x</a></span><div inert><button id="i">i</button></div>
      <div id="r" tabindex="0">r</div><button id="z">z</button></div>`);
    await page.addScriptTag({ content: code });
    const ids = await page.evaluate(() => window.wrap.focusStops(document.getElementById("root")).map(node => node.id));
    assert.deepEqual(ids, ["a", "r", "z"]);
    // Safari before 17.4 has no checkVisibility: the wrap falls back to client rects instead of throwing on Tab (land-14 review).
    const old = await page.evaluate(() => { delete Element.prototype.checkVisibility; try { return window.wrap.focusStops(document.getElementById("root")).map(node => node.id); } catch (error) { return String(error); } });
    assert.deepEqual(old, ["a", "r", "z"], "without checkVisibility the fallback still drops visibility:hidden and collapse, and nothing throws (r194 N1, r197b N3)");
  } finally { await browser.close(); }
});

test("Turnstile layer: with a stand-in widget frame, 30 Tab and 30 Shift+Tab presses never leave the dialog", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const page = await (await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, reducedMotion: "reduce" })).newPage();
      await openState(page, "verification", { settle: 300 });
      await page.evaluate(() => {
        const frame = document.createElement("iframe");
        frame.title = "Widget containing a Cloudflare security challenge";
        frame.src = "data:text/html,<div tabindex=0>a</div><div tabindex=0>b</div><input type=checkbox aria-label=verify>";
        document.querySelector(".oak-verification__placeholder").replaceWith(frame);
      });
      const layer = page.locator(".oak-verification[data-visible=true]");
      assert.ok(await layer.getAttribute("aria-labelledby"), `${width}: the check layer has a name`);
      assert.equal(await page.evaluate(() => document.activeElement?.closest(".oak-verification") !== null), true, `${width}: focus starts in the layer`);
      for (const key of ["Tab", "Shift+Tab"]) {
        const stops = await walk(page, key);
        assert.deepEqual(outside(stops), [], `${width}: ${key} stays in the dialog`);
        assert.ok(visits(stops, "Cancel") && visits(stops, "IFRAME"), `${width}: ${key} reaches the widget and Cancel`);
      }
      await page.context().close();
    }
  } finally { await browser.close(); }
});

test("command palette: 30 Tab presses never leave it and Escape returns focus to the Search button", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const { context, page, field } = await openPalette(browser, width);
      await field.fill("oak");
      for (const key of ["Tab", "Shift+Tab"]) {
        const stops = await walk(page, key);
        assert.deepEqual(outside(stops), [], `${width}: ${key} stays in the palette`);
        assert.ok(visits(stops, "Search without asking") && visits(stops, "A "), `${width}: ${key} cycles the field and the rows`);
      }
      await page.keyboard.press("Escape");
      await field.waitFor({ state: "hidden" });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Search pages, sections and projects", `${width}: focus back on the opener`);
      await context.close();
    }
  } finally { await browser.close(); }
});

const rowState = page => page.evaluate(() => {
  const rows = [...document.querySelectorAll(".oak-palette__row")];
  const shown = node => node && getComputedStyle(node).display !== "none";
  return { focused: rows.indexOf(document.activeElement), filled: rows.flatMap((row, i) => getComputedStyle(row).backgroundColor !== "rgba(0, 0, 0, 0)" ? [i] : []),
    hint: rows.flatMap((row, i) => shown(row.querySelector(".oak-palette__enter")) ? [i] : []) };
});

test("ticket 192: command palette keeps exactly one active row through Tab, hover, ArrowDown on a focused row and Shift+Tab", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const { context, page } = await openPalette(browser, width);
      const one = async (step, row) => {
        const state = await rowState(page);
        assert.deepEqual(state.filled, [row], `${width} ${step}: only row ${row} carries the fill`);
        // The Enter hint rides the active row at 1280 and stays hidden at 390 by design.
        assert.deepEqual(state.hint, width === 390 ? [] : [row], `${width} ${step}: the Enter hint sits on the active row`);
        return state;
      };
      for (let i = 0; i < 12 && !(await page.evaluate(() => document.activeElement === document.querySelectorAll(".oak-palette__row")[1])); i++) await page.keyboard.press("Tab");
      assert.equal((await one("tab", 1)).focused, 1, `${width}: Tab reaches the second row`);
      const fourth = await page.locator(".oak-palette__row").nth(3).boundingBox();
      await page.mouse.move(fourth.x + fourth.width / 2, fourth.y + fourth.height / 2);
      await page.waitForTimeout(100);
      await one("hover row 4 while row 2 is focused", 1);
      await page.mouse.move(0, 0);
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(100);
      assert.equal((await one("ArrowDown on the focused row", 2)).focused, 2, `${width}: ArrowDown moves focus with the fill`);
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(100);
      assert.equal((await one("Shift+Tab back", 1)).focused, 1, `${width}: Shift+Tab lands on the row above, the only one filled`);
      await context.close();
    }
  } finally { await browser.close(); }
});

test("timeline lanes: each lane's accessible text carries its dates", async () => {
  const browser = await chromium.launch();
  try {
    for (const id of ["timeline-lanes-2", "timeline-lanes-5"]) {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await openState(page, id, { settle: 300 });
      const lanes = await page.locator(".oak-lanes__lane").all();
      assert.ok(lanes.length >= 2, `${id}: the lanes drew`);
      for (const lane of lanes) {
        const heard = await lane.ariaSnapshot();
        assert.match(heard, /[A-Z][a-z]{2} \d{4}/, `${id}: a lane reads a month and year (${heard})`);
      }
      await page.context().close();
    }
  } finally { await browser.close(); }
});

const fieldRing = page => page.evaluate(() => {
  const field = document.querySelector(".oak-palette__field");
  const style = getComputedStyle(field);
  return { focused: document.activeElement?.classList.contains("oak-palette__input"), outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}` };
});

test("204 N2: the palette search field shows a 2px ring when focused, and an outline in forced colors", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const plain = await openPalette(browser, width);
      const ring = await fieldRing(plain.page);
      assert.ok(ring.focused, `${width}: focus is in the field`);
      assert.equal(ring.outline, "solid 2px -6px", `${width}: a 2px ring inset from the panel edge on the focused field`);
      await plain.context.close();
      const forced = await openPalette(browser, width, { forcedColors: "active" });
      const outline = await fieldRing(forced.page);
      assert.ok(outline.focused, `${width} forced colors: focus is in the field`);
      assert.equal(outline.outline, "solid 2px -2px", `${width} forced colors: the focused field has a 2px Highlight outline`);
      await forced.context.close();
    }
  } finally { await browser.close(); }
});

test("204 recruiter P3: Clear search is at least 44 by 44 at 390", async () => {
  const browser = await chromium.launch();
  try {
    const { context, page, field } = await openPalette(browser, 390);
    await field.fill("oak");
    const clear = page.getByRole("button", { name: "Clear search" });
    await clear.waitFor();
    const box = await clear.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `Clear search is ${box.width}x${box.height}`);
    await context.close();
  } finally { await browser.close(); }
});

test("204 N3: the workspace status region is mounted before a 401 and only its text changes; the failure line names the next step", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, reducedMotion: "reduce" });
      await context.route(/\/api\/oak\/chat/, route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "invalid-session" }) }));
      const page = await context.newPage();
      await page.goto(`${galleryUrl}/`, { waitUntil: "networkidle" });
      await page.locator("[data-oak-workspace-launcher]").first().focus();
      await page.keyboard.press("Enter");
      const box = page.getByRole("textbox", { name: "Message Oak AI Agent" });
      await box.waitFor();
      await page.evaluate(() => { window.__region = document.querySelector("[role=dialog] .oak-workspace__live[aria-live=polite]"); });
      assert.equal(await page.evaluate(() => window.__region?.textContent.trim() ?? null), "", `${width}: an empty polite region is mounted before the send`);
      await box.fill("How does Steve build agents?");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => /Sign in again/.test(window.__region?.textContent ?? ""), null, { timeout: 5000 });
      assert.ok(await page.evaluate(() => window.__region.isConnected), `${width}: the same region carries the notice`);
      const line = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] .sr-only")].map(node => node.textContent).find(text => /Answer failed/.test(text)) ?? "");
      assert.match(line, /Answer failed\. This answer stopped before it finished\. Your question is back in the message box\./, `${width}: the failure line names what happened and what next`);
      await context.close();
    }
  } finally { await browser.close(); }
});
