import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// D131: fixes from the two-axis review of wave 9. D132: living answer and brief art, a shelf for Sources, a toolbox for Tools.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const read = file => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const open = async (page, state, query = "") => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
const withPage = async (run, reducedMotion = "reduce") => {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion })).newPage()); } finally { await browser.close(); }
};

test("D131-G1 the next step and its prefill read only what the visitor typed, within the tool field's limit", () => {
  const { oakNextStep, oakVisitorWords, oakNextStepPrefill } = loadTsx("src/lib/oakNextStep.ts");
  const sent = { text: "About \u201cHe led roles across our team\u201d\n\ntell me more", quoted: { quotes: ["He led roles across our team"], text: "tell me more" } };
  assert.equal(oakVisitorWords(sent), "tell me more", "quoted lines are not the visitor's words");
  assert.equal(oakNextStep(oakVisitorWords(sent), { kind: "sourced" }, "open"), null, "a quoted answer phrase never picks a tool");
  assert.equal(oakVisitorWords({ text: "Is he a fit for this role?" }), "Is he a fit for this role?");
  const long = `Is Steve a fit for ${"a senior design engineering role ".repeat(14)}?`;
  assert.ok(long.length > 400 && long.length < 1500);
  assert.equal(oakNextStepPrefill("role", long), "", "never past the role request's 400 characters");
  assert.equal(oakNextStepPrefill("brief", long), long, "the brief's goals take it whole");
  assert.equal(oakNextStepPrefill("role", "Is he a fit?"), "Is he a fit?");
});

test("D131-G2 after declining contact, the next question moves past the decline note so follow-ups can return", () => withPage(async page => {
  await page.route("**/api/oak/chat**", route => route.abort());
  await open(page, "answer-points");
  await store(page, workspace => workspace.declineOakContactOffer());
  assert.match(await store(page, workspace => workspace.getOakWorkspace().contactNotice), /contact suggestions/, "the note answers the decline");
  await page.locator(".oak-composer textarea").fill("What did he ship last?");
  await page.locator(".oak-composer textarea").press("Enter");
  await page.waitForFunction(() => document.querySelector(".ui-message[data-align='end']:last-of-type") !== null, null, { timeout: 5000 });
  assert.equal(await store(page, workspace => workspace.getOakWorkspace().contactNotice), "", "a new question clears it");
  assert.equal(await store(page, workspace => workspace.getOakWorkspace().contactPreference), "declined", "the preference itself stays");
}));

test("D131-G3 Ask Steve for more answers never overwrites words already in the brief", () => withPage(async page => {
  await open(page, "funding");
  await store(page, workspace => { workspace.openOakContactBrief(); workspace.setOakContactBriefInput("goals", "My own words for Steve"); workspace.openOakSurface("funding"); });
  await page.getByRole("button", { name: "Ask Steve for more answers" }).click();
  await page.locator("#oak-brief-goals").waitFor({ timeout: 3000 });
  assert.equal(await page.locator("#oak-brief-goals").inputValue(), "My own words for Steve");
}));

test("D131-G4 a tip shows once: reopening its panel or the page does not bring it back", () => withPage(async page => {
  await open(page, "empty", "&tips=live");
  await page.locator('.oak-tip[data-tip="welcome"]').waitFor({ timeout: 3000 });
  await open(page, "empty", "&tips=live");
  assert.equal(await page.locator('.oak-tip[data-tip="welcome"]').count(), 0, "the welcome tip shows on one visit, not every visit");
  await open(page, "advice-intake", "&tips=live");
  const tip = page.locator('.oak-workflow .oak-tip[data-tip="advice"]');
  await tip.waitFor({ timeout: 3000 });
  await page.waitForTimeout(300);
  assert.equal(await tip.count(), 1, "it stays up while this panel is open");
  await store(page, workspace => workspace.closeOakSurface());
  await page.locator('.oak-tip[data-tip="advice"]').waitFor({ state: "detached", timeout: 3000 });
  await store(page, workspace => workspace.openOakSurface("advice"));
  await page.locator(".oak-workflow").first().waitFor({ timeout: 3000 });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.oak-tip[data-tip="advice"]').count(), 0, "reopening the panel: taught once");
}));

test("D131-G5 a message too long to keep its quotes is held with a plain reason, never sent without them", () => withPage(async page => {
  const sent = [];
  await page.route("**/api/oak/chat**", route => { sent.push(route.request().url()); return route.abort(); });
  await open(page, "answer-points");
  const typed = "x".repeat(3990);
  const result = await store(page, async (workspace, words) => {
    workspace.addOakQuote("He separated short-term context from durable memory");
    workspace.setOakDraft(words);
    await workspace.submitOakTurn();
    const state = workspace.getOakWorkspace();
    return { quotes: state.quotes.length, draft: state.draft.length, error: state.error, pending: state.pending };
  }, typed);
  assert.equal(result.quotes, 1, "the quote stays staged");
  assert.equal(result.draft, typed.length, "the words stay whole");
  assert.match(result.error ?? "", /too long to keep your quotes/, "and the visitor is told why");
  assert.equal(result.pending, false);
  assert.equal(sent.length, 0, "nothing is sent");
}));

test("D131-G6 Steve's legacy case studies read as Portfolio, and a registry brand like OpenRouter gets its bundled icon", () => {
  const { oakSourceSite, oakSourceShortLabel } = loadTsx("src/lib/oakCitationLabels.ts");
  const { oakSourceMeaning } = loadTsx("src/lib/oakMeaningIcons.ts");
  const { OakSourceFace } = loadTsx("src/components/agent/OakSourceChip.tsx");
  const face = url => renderToStaticMarkup(createElement(OakSourceFace, { url }));
  const legacy = oakSourceSite("https://independent-performance-642823.framer.app/codex/ai-memory-hallucination-solution");
  assert.equal(legacy.firstParty, true, "the old Framer site is Steve's own");
  assert.equal(oakSourceMeaning({ documentId: "legacy:agentic-brain" }), "source.case-study");
  assert.match(face("https://openrouter.ai/docs"), /src="\/assets\/brand-icons\/openrouter\.png"/, "a registry brand shows its bundled icon");
  assert.match(face("https://github.com/Absorber97"), /src="\/assets\/brand-icons\/github\.png"/, "hand-kept hosts still win");
  assert.doesNotMatch(face("https://example.org/post"), /<img/, "unknown hosts keep their initial, with no fetched favicon");
  assert.equal(oakSourceSite("https://steveoak.com/work/oakminder").firstParty, true);
  assert.equal(oakSourceShortLabel("How a Small ML Project Accidentally Helped Me Solve AI's Biggest Problems: Memory"), "How a Small ML\u2026", "a long name stops at a whole word");
  assert.equal(oakSourceShortLabel("Steve Oak / Okkar Kyaw"), "Steve Oak");
  assert.equal(oakSourceShortLabel("EcoSmartLoop: AI Agent Platform"), "EcoSmartLoop");
});

test("D132-G1 the advice, role and brief art are 4-frame loops with a still, and the shelf and toolbox are mapped poses", async () => {
  const map = JSON.parse(read("design/visual-integration/oak-agent-assets-v2.json"));
  const union = read("src/components/agent/OakActivitySprite.tsx");
  for (const pose of ["lantern", "comparing", "brief-letter"]) {
    const asset = map.assets[pose];
    assert.equal(asset.animated, true, `${pose}: animated`);
    assert.match(asset.source, /-v7\.png$/, `${pose}: the v7 sheet`);
    assert.ok(existsSync(asset.reducedMotionFrame.source), `${pose}: a reduced-motion still`);
    assert.ok(existsSync(`public${asset.publicSrc}`) && existsSync(`public${asset.reducedMotionFrame.publicSrc}`), `${pose}: generated`);
  }
  for (const pose of ["bookshelf", "toolbox"]) {
    assert.equal(map.assets[pose]?.pose, pose, `${pose}: in the asset map`);
    assert.match(union, new RegExp(`"${pose}"`), `${pose}: in the pose union`);
  }
  // R11 (intentional update, Oak review v8): the tools menu dropped its toolbox header to cut load; the art stays generated.
  assert.equal(map.states["tools-menu"].iconOnly, true, "the tools menu state records why it is icon-only");
  for (const file of ["lantern-v7", "comparing-v7", "brief-letter-v7", "bookshelf-v7", "toolbox-v7", "lantern-v7-still"]) {
    const { data, info } = await sharp(`src/assets/source-media/agent/oak-agent-${file}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
    assert.deepEqual([alpha(0, 0), alpha(info.width - 1, 0), alpha(0, info.height - 1), alpha(info.width - 1, info.height - 1)], [0, 0, 0, 0], `${file}: true alpha`);
  }
});

// R11 (intentional update): Tools no longer opens on a toolbox header; it is three short rows (r11-menus.test.mjs).
test("D132-G2 Tools opens straight on its rows, Sources on its shelf, and the answer loops rest after two plays", () => withPage(async page => {
  await open(page, "tools-menu");
  const menu = page.locator('[role="menu"][aria-label="Oak tools"]');
  await menu.waitFor({ timeout: 3000 });
  assert.equal(await menu.locator(".oak-activity-sprite").count(), 0, "no header picture");
  assert.equal(await page.getByRole("menuitem").count(), 3, "the three message modes");
  await open(page, "answer-points");
  await page.locator(".oak-turn__answer .oak-answer__sources-button").click();
  const panel = page.locator(".oak-sources-panel");
  await panel.waitFor({ timeout: 3000 });
  assert.equal(await panel.locator('.oak-sources-panel__header .oak-activity-sprite[data-pose="bookshelf"]').count(), 1, "the panel's shelf");
  assert.match(await panel.locator(".oak-sources-panel__count").innerText(), /^\d+ pages? behind this answer$/);
  await open(page, "advice");
  const loop = page.locator('.oak-turn__kind .oak-activity-sprite[data-pose="lantern"] .oak-activity-sprite__sheet');
  await loop.waitFor({ timeout: 3000 });
  assert.equal(await loop.evaluate(node => getComputedStyle(node).animationIterationCount), "2", "two plays, then rest");
  await page.locator(".ui-message").filter({ has: loop }).hover();
  assert.equal(await loop.evaluate(node => getComputedStyle(node).animationIterationCount), "infinite", "and again under the pointer");
}, "no-preference"));
