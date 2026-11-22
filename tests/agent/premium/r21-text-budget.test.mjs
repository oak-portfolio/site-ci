import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// R21 (Oak, review v18: role and source cards "way too text heavy", "they look the same hierarchy", one chip holding three
// job titles). Every answer card in every 1280 gallery state shows its lead and at most one more claim line until the
// visitor opens "n more"; no role title chip holds more than one job title; a source card's claim is quieter than its title.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const states = readFileSync(new URL("../../../src/data/dev/oak-states.json", import.meta.url), "utf8").split("\n")
  .map(line => line.match(/^\s*\{\s*"id":\s*"([^"]+)"/)?.[1]).filter(id => id && /^(answer-|research-|role-fit-answer)/.test(id));

const probe = () => {
  const out = [];
  const shown = node => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !node.closest("[hidden]");
  for (const card of document.querySelectorAll(".oak-openui-card:not([data-pending])")) {
    const lines = [...card.querySelectorAll(".oak-openui-card__lead, .oak-openui-card__claims > li")].filter(shown).length;
    if (lines > 2) out.push(`${card.className.split(" ").at(-1)} shows ${lines} claim lines`);
  }
  for (const chip of document.querySelectorAll(".oak-openui-role__titles .oak-openui-chip"))
    if (chip.textContent.includes(",")) out.push(`title chip "${chip.textContent}" holds more than one title`);
  for (const card of document.querySelectorAll(".oak-openui-source:not([data-pending])")) {
    const quote = card.querySelector(".oak-openui-source__excerpt"), title = card.querySelector(".oak-openui-source__title");
    if (!quote || !title) continue;
    const q = getComputedStyle(quote), t = getComputedStyle(title);
    if (Number(q.fontWeight) >= Number(t.fontWeight) && q.color === t.color) out.push("source claim reads at its title's level");
  }
  return out;
};

test("Q24 R21 answer cards keep a text budget: a lead, one more line at most, one title per chip, a quieter source claim", async () => {
  assert.ok(states.length >= 15, `answer states ${states.length}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const failures = [];
    for (const state of states) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForTimeout(300);
      for (const miss of await page.evaluate(probe)) failures.push(`${state}: ${miss}`);
    }
    assert.deepEqual(failures, []);
    // The fold opens and shows what it held.
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-openui-roles-three`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready");
    const trigger = page.locator(".oak-openui-card__more-trigger").first();
    await trigger.click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".oak-openui-card__more-panel").first().isVisible(), true);
    // R21 code review: each fold names what it opens, and a closed fold stays findable (hidden="until-found").
    assert.match(await trigger.getAttribute("aria-label"), /more about Oak Labs/);
    assert.equal(await page.locator(".oak-openui-card__more-panel").nth(1).getAttribute("hidden"), "until-found");
  } finally { await browser.close(); }
});

// R22 (Oak, live v18 cards/10-numbers: "too many big text"): a sentence-long claim set at heading size read as a wall.
// In every answer state, body text above the answer's prose size stays on one line, and heading-face text (a page or
// card title) shows two lines at most; anything longer is body text in the body face at the prose size.
const bigTextProbe = () => {
  // R22 live: "body" is the answer's own prose size (14px in the workspace), not the site's 16px body token; a 16px lead
  // under 14px prose wrapped to five lines and passed.
  const prose = document.querySelector(".oak-openui__prose");
  const out = [], body = prose ? parseFloat(getComputedStyle(prose).fontSize) : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-body-md")) || 16;
  const seen = new Set();
  for (const root of document.querySelectorAll(".oak-openui, .oak-answer-tile, [class*='oak-answer__']")) for (const node of [root, ...root.querySelectorAll("*")]) {
    if (seen.has(node)) continue; seen.add(node);
    const own = [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim().length > 0);
    if (!own || !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const style = getComputedStyle(node), size = parseFloat(style.fontSize);
    const line = parseFloat(style.lineHeight) || size * 1.4, range = document.createRange();
    range.selectNodeContents(node);
    // A clamped title counts the lines it shows, not the ones it holds.
    const lines = Math.round(Math.min(range.getBoundingClientRect().height, node.getBoundingClientRect().height) / line);
    const heading = /walsheim/i.test(style.fontFamily.split(",")[0]);
    if ((!heading && lines >= 2 && size > body + 0.5) || (heading && lines >= 3))
      out.push(`${String(node.className) || node.tagName} wraps ${lines} lines at ${size}px${heading ? " in the heading face" : ""}: "${node.textContent.trim().slice(0, 48)}"`);
  }
  return out;
};

test("Q24 R22 no answer text wraps at heading size: long claims stay body text in every 1280 answer state", async () => {
  assert.ok(states.includes("answer-openui-source-gap"), "the live numbers gap answer has a gallery state");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const failures = [];
    for (const state of states) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForTimeout(300);
      for (const miss of await page.evaluate(bigTextProbe)) failures.push(`${state}: ${miss}`);
    }
    assert.deepEqual(failures, []);
    // R22: the clamped title's link still covers the whole picture, the open arrow included.
    for (const state of ["answer-openui-source", "answer-openui-source-gap"]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForTimeout(300);
      const hits = await page.evaluate(() => [...document.querySelectorAll(".oak-openui-source__page")].flatMap(face => {
        face.scrollIntoView({ block: "center" }); const r = face.getBoundingClientRect();
        return [[0.15, 0.2], [0.5, 0.5], [0.95, 0.85]].map(([x, y]) => Boolean(document.elementFromPoint(r.left + r.width * x, r.top + r.height * y)?.closest(".oak-openui-source__title a")));
      }));
      assert.ok(hits.length >= 3 && hits.every(Boolean), `${state}: picture points that open the page ${JSON.stringify(hits)}`);
      // R22 code review: the site line and the claim above the picture stay their own text, outside the link.
      const outside = await page.evaluate(() => [...document.querySelectorAll(".oak-openui-source__kicker, .oak-openui-source__excerpt")].map(node => {
        node.scrollIntoView({ block: "center" }); const r = node.getBoundingClientRect();
        return !document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.5)?.closest(".oak-openui-source__title a");
      }));
      assert.ok(outside.length >= 2 && outside.every(Boolean), `${state}: kicker and claim outside the link ${JSON.stringify(outside)}`);
    }
    // R22 code review: a clamped title hides words only when it already uses all its room (half a wide picture, all of a
    // narrow one); at 42% of its own width it once hid words that had space.
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const state of ["answer-openui-source", "answer-openui-source-gap"]) {
        await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
        await page.waitForTimeout(300);
        const cut = await page.evaluate(() => [...document.querySelectorAll(".oak-openui-source[data-face='image'] .oak-openui-source__title")].flatMap(title => {
          // The room the stylesheet grants: max(50%, min(100%, 320px)) of the text column.
          const clamp = title.querySelector("a") ?? title, column = title.parentElement.getBoundingClientRect().width;
          const room = Math.max(column * 0.5, Math.min(column, 320)), used = title.getBoundingClientRect().width;
          const face = title.closest(".oak-openui-source__page").clientWidth;
          const misses = column < face * 0.6 ? [`text column ${Math.round(column)} of a ${face}px picture`] : [];
          return clamp.scrollHeight > clamp.clientHeight + 1 && used < room - 24 ? [...misses, `${title.textContent.slice(0, 32)} cut at ${Math.round(used)} of ${Math.round(room)}px`] : misses;
        }));
        assert.deepEqual(cut, [], `${state}@${width}`);
      }
    }
  } finally { await browser.close(); }
});

test("Q24 R21 a role's years read as years, not months", () => {
  const { oakRoleYears } = loadTsx("src/lib/openui.tsx");
  assert.equal(oakRoleYears("Feb 2026 - May 2026"), "2026");
  assert.equal(oakRoleYears("Jan 2024 - Jan 2025"), "2024 \u2013 2025");
  assert.equal(oakRoleYears("May 2026 - Present"), "2026 \u2013 Now");
  assert.equal(oakRoleYears(undefined), null);
  // R21 code review: a period it cannot read as years shows as written, never blank.
  assert.equal(oakRoleYears("January to March 2026"), "January to March 2026");
});
