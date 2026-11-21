import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import stylelint from "stylelint";
import { chromium } from "playwright";

// D121 (Oak): large radius for big surfaces, capsules for most things, Apple's concentric rule between them.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const radiusFindings = async (options) => (await stylelint.lint({ ...options, cache: false })).results
  .flatMap(result => result.warnings).filter(warning => warning.rule === "portfolio/agent-tokens" && /concentric/.test(warning.text));
const snippet = code => radiusFindings({ code, codeFilename: path.resolve("tests/design-policy/fixtures/design-rework.css") });

test("D121-G1 the agent lint rejects mid-size corners and accepts capsules and concentric steps", async () => {
  for (const value of ["var(--radius-sm)", "calc(var(--radius-sm) * 2)", "calc(var(--radius-sm) * 1.5)", "var(--radius-md) var(--radius-sm)"])
    assert.equal((await snippet(`.oak-fixture { border-radius: ${value}; }`)).length, 1, `${value} is off the scale`);
  for (const value of ["var(--radius-pill)", "var(--oak-r-sheet)", "var(--oak-r-card)", "var(--oak-card-radius)", "calc(var(--oak-r-card) - var(--space-micro))",
    "calc(var(--radius-md) - var(--space-xs))", "0 0 var(--oak-r-card) var(--oak-r-card)", "inherit"])
    assert.equal((await snippet(`.oak-fixture { border-radius: ${value}; }`)).length, 0, `${value} is on the scale`);
  assert.equal((await snippet(".ui-kbd { border-radius: var(--radius-sm); }")).length, 0, "a keycap keeps its small corner");
});

test("D121-G2 the agent stylesheets use only the concentric scale", async () => {
  const findings = await radiusFindings({ files: ["src/styles/oakAgent.css", "src/styles/ui.css"] });
  assert.deepEqual(findings.map(warning => `${warning.line}: ${warning.text.slice(0, 40)}`), []);
});

test("D121-G3 in the browser, compact controls are capsules and cards keep large corners", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const problems = [];
    for (const state of ["answer-points", "quote-chips", "role-fit", "funding", "contact-brief", "onboarding-tips", "advice"]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(600);
      problems.push(...await page.evaluate(id => {
        const out = [];
        const visible = node => node.checkVisibility() && node.getBoundingClientRect().height > 0;
        for (const node of document.querySelectorAll(".oak-workspace :is(.ui-button, .ui-suggestion, .oak-source-chip__trigger, .oak-quote-chip, .oak-starter-glyph)")) {
          // v3 review: a Related row is a full-width list row between hairlines (Perplexity), not a compact control.
          if (!visible(node) || node.closest(".oak-related")) continue;
          const { height } = node.getBoundingClientRect(), radius = parseFloat(getComputedStyle(node).borderTopLeftRadius);
          if (height <= 44 && radius < height / 2 - 1) out.push(`${id}: ${node.className.toString().split(" ")[0]} ${Math.round(height)}px tall, ${radius}px corner`);
        }
        for (const node of document.querySelectorAll(".oak-workspace :is(.oak-group__body, .ui-radio-card, .oak-tip__card, .ui-input-group, .oak-advice-card)")) {
          if (!visible(node) || node.getBoundingClientRect().height <= 44) continue;
          const radius = parseFloat(getComputedStyle(node).borderTopLeftRadius);
          if (radius < 16) out.push(`${id}: ${node.className.toString().split(" ")[0]} card ${radius}px corner`);
        }
        return out;
      }, state));
    }
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
