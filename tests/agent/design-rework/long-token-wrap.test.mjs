import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// Ticket 87 (SPEC story 95): a 190-character unbroken word, inside every contract cap, wraps inside its card and the composer.
const root = path.resolve(import.meta.dirname, "../../..");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const hasBrowser = await chromium.launch().then(browser => browser.close().then(() => true), () => false);
const noBrowser = hasBrowser || process.env.CI ? false : "no Playwright browser on this runner; CI runs this layout check";
const states = ["answer-openui-compare-paired", "research-web", "answer-openui-web-blend", "answer-document"];
const viewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
const token = "W".repeat(190);
const textKeys = new Set(["text", "title", "name", "excerpt", "quote", "label", "acknowledgment", "reason", "summary", "gap"]);
const lengthen = s => `${token} ${s.slice(0, 8)}`;

const programStrings = src => src.replace(/"((?:[^"\\]|\\.)*)"/g, (whole, inner) =>
  /^(claim-\d+|[a-z][A-Za-z0-9-]*|[\d.,+]*)$/.test(inner) ? whole : JSON.stringify(lengthen(inner.replace(/\\"/g, '"'))));
const mutate = (value, key) => Array.isArray(value) ? value.map(item => mutate(item, key))
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mutate(v, k)]))
  : typeof value !== "string" ? value : key === "program" ? programStrings(value) : textKeys.has(key) ? lengthen(value) : value;

function answersModule() {
  const data = mutate(JSON.parse(readFileSync(path.join(root, "tests/agent/work-answers.v1.json"), "utf8")));
  const names = Object.keys(data).filter(name => /^[A-Za-z_$][\w$]*$/.test(name));
  return names.map(name => `export const ${name} = ${JSON.stringify(data[name])};\n`).join("") + `export default {${names.join(",")}};\n`;
}

async function feedLongToken(page) {
  await page.route(/(oak-states|work-answers\.v1)\.json/, async route => {
    const response = await route.fetch();
    const body = await response.text();
    const inline = body.match(/JSON\.parse\(("(?:[^"\\]|\\.)*")\)/);
    const out = route.request().url().includes("work-answers") ? answersModule()
      : `export default JSON.parse(${JSON.stringify(JSON.stringify(mutate(JSON.parse(JSON.parse(inline[1])))))});\n`;
    await route.fulfill({ response, body: out, headers: { ...response.headers(), "content-length": String(Buffer.byteLength(out)), etag: "" } });
  });
}

async function open(page, id) {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(600);
}

const overflow = () => {
  const card = node => {
    for (let box = node.parentElement; box && !box.matches(".oak-workspace"); box = box.parentElement) {
      const style = getComputedStyle(box);
      if (style.borderTopWidth !== "0px" || style.backgroundColor !== "rgba(0, 0, 0, 0)") return box;
    }
    return null;
  };
  const out = [];
  const walker = document.createTreeWalker(document.querySelector(".oak-workspace"), NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    if (!node.textContent.trim() || node.parentElement.closest(".sr-only")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    if (!text.width) continue;
    let shown = text.right;
    for (let clip = node.parentElement; clip; clip = clip.parentElement) {
      if (getComputedStyle(clip).overflowX !== "visible") shown = Math.min(shown, clip.getBoundingClientRect().right);
    }
    const box = card(node)?.getBoundingClientRect();
    const limit = Math.min(innerWidth, box?.right ?? innerWidth);
    if (shown > limit + 1) out.push(`${node.parentElement.tagName.toLowerCase()}.${node.parentElement.className} ends at ${Math.round(shown)}, its card at ${Math.round(limit)}`);
  }
  return { found: [...new Set(out)], scrollWidth: document.documentElement.scrollWidth, width: document.documentElement.clientWidth };
};

const boxes = () => [...document.querySelectorAll(".oak-workspace *")].map(el => {
  const r = el.getBoundingClientRect();
  return `${el.tagName} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
});

for (const viewport of viewports) {
  test(`87 a 190-character word stays inside its card and the page at ${viewport.width}`, { skip: noBrowser }, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
      await feedLongToken(page);
      const spills = {};
      for (const id of states) {
        await open(page, id);
        const seen = await page.evaluate(overflow);
        if (seen.scrollWidth > seen.width) seen.found.push(`page scrolls sideways to ${seen.scrollWidth} past ${seen.width}`);
        if (seen.found.length) spills[id] = seen.found;
      }
      assert.deepEqual(spills, {}, `text runs past its card at ${viewport.width}`);
      await open(page, "research-sources");
      const clamp = await page.evaluate(() => [...document.querySelectorAll(".oak-research__card .oak-research__source-title")].map(el =>
        Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))));
      assert.ok(clamp.length && clamp.every(lines => lines === 2), `a long source title still clamps to two lines (${clamp})`);
    } finally {
      await browser.close();
    }
  });

  test(`87 ordinary text keeps its layout under the wrap rule at ${viewport.width}`, { skip: noBrowser }, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
      for (const id of states) {
        await open(page, id);
        const wrapped = await page.evaluate(boxes);
        await page.addStyleTag({ content: ".oak-turn__answer, .oak-composer__attachments .ui-button { overflow-wrap: normal !important; }" });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.deepEqual(await page.evaluate(boxes), wrapped, `${id} at ${viewport.width}: ordinary text moved`);
      }
    } finally {
      await browser.close();
    }
  });
}

test("87 the wrap rule sits on the shared answer box and the document chip", () => {
  const css = readFileSync(path.join(root, "src/styles/oakAgent.css"), "utf8");
  const rule = selector => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`))?.[1] ?? "";
  assert.match(rule(".oak-turn__answer"), /overflow-wrap: anywhere;/, "the answer box carries the rule its blocks inherit");
  assert.match(rule(".oak-composer__attachments .ui-button"), /overflow-wrap: anywhere;/, "the document chip wraps its label");
});
