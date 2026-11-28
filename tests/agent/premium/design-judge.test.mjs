import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { compareDebt, debtChanges, formatChange, judgeLikes, rebuildDebt, readFindings, refreshCommand, staleDebt, ticketFor, unlistedFindings } from "../../../scripts/design-policy/judge-debt.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { GALLERY_LAYOUT_WIDTHS, GALLERY_PAGE_WIDTHS, JUDGE_WIDTHS, LAYOUT_RULE_IDS, PAGE_RULE_IDS, RULE_REFS, debtDetail, describeFinding, judgeGalleryState, judgeLayout, judgePage, judgeStates, severitySlots, waitForStill } from "../../../scripts/design-policy/design-judge.mjs";
import { galleryStates, galleryUrl } from "./gallery.mjs";

const fixtureUrl = name => new URL(`./design-judge-fixtures/${name}.html`, import.meta.url).href;
const readJson = name => JSON.parse(readFileSync(new URL(`./design-judge-fixtures/${name}.json`, import.meta.url), "utf8"));

const failing = [
  { file: "card-in-card", rule: "card-in-card", says: /sits inside card/ },
  { file: "card-in-card-wrapper", rule: "card-in-card", says: /wrapper around/ },
  { file: "icon-doubling", rule: "icon-doubling", says: /holds 2 icons/ },
  { file: "icon-doubling-levels", rule: "icon-doubling", says: /repeats in/ },
  { file: "uneven-row", rule: "uneven-row", says: /120 vs 160px/ },
  { file: "hue-count", rule: "hue-count", says: /4 hues/ },
  { file: "tight-spacing", rule: "tight-spacing", says: /4px apart/ },
  { file: "tight-spacing-padding", rule: "tight-spacing", says: /6px padding/ },
  { file: "edge-miss", rule: "edge-miss", says: /ends 0\/40px/ },
  { file: "stray-blur", rule: "stray-blur", says: /not a floating layer/ },
  { file: "stray-blur-fixed", rule: "stray-blur", says: /div\.card blurs .* not a floating layer/ },
  { file: "white-panel", rule: "white-panel", says: /bright/ },
  { file: "no-picture", rule: "no-picture", says: /plain block shows no picture/ },
  { file: "case-image-frame", rule: "case-image-frame", says: /200px wide outside a media frame/ },
  { file: "glass-contrast", rule: "glass-contrast", says: /over the brightest text behind it/ },
  { file: "metric-numeral", rule: "metric-numeral", says: /22px, under 40px/ },
  { file: "metric-gradient", rule: "metric-numeral", says: /"42%" has no gradient fill/ },
  { file: "prose-cell", rule: "prose-cell", says: /characters a line/ },
  { file: "prose-cell-picture", rule: "prose-cell", says: /keeps a picture beside prose/ },
  { file: "top-bar", rule: "top-bar", says: /no named Search entry/ },
  { file: "top-bar-phone", rule: "top-bar", says: /36x36px at 390px/, viewport: { width: 390, height: 844 } },
  { file: "capsule-radius", rule: "capsule-radius", says: /radius 8px on 36px height/ },
  { file: "elevation-tier", rule: "elevation-tier", says: /outside the three elevation tiers/ },
  { file: "inert-closed", rule: "inert-closed", says: /still in the tab and reading order/ },
  { file: "inert-filtered", rule: "inert-closed", says: /filtered out but still in the tab/ },
  { file: "verified-claim", rule: "verified-claim", says: /"verified"/ },
  { file: "verified-claim-words", rule: "verified-claim", says: /"fact-checked"/ },
  { file: "verified-claim-words", rule: "verified-claim", says: /"accurate"/ },
  { file: "verified-claim-char", rule: "verified-claim", says: /check mark character/ },
  { file: "verified-claim-mark", rule: "verified-claim", says: /check mark icon "tick"/ },
  { file: "invented-chart", rule: "invented-chart", says: /no recorded source/ },
  { file: "generated-image", rule: "generated-image", says: /generated picture/ },
  { file: "emoji-icon", rule: "emoji-icon", says: /uses the emoji/ },
  { file: "plus-n-sources", rule: "plus-n-sources", says: /\+23 sources/ },
  { file: "dense-paragraph", rule: "dense-paragraph", says: /words into one paragraph/ },
  { file: "text-overlap", rule: "text-overlap", says: /overlaps/, widths: [1280] },
  { file: "text-overlap-scrolled", rule: "text-overlap", says: /overlaps/, widths: [1280] },
  { file: "reflow", rule: "reflow", says: /wraps/, widths: [1280] },
  { file: "reflow-scroll", rule: "reflow", says: /scrolls sideways/, widths: [390] },
  { file: "reflow-root", rule: "reflow", says: /main\.oak-workspace overflows sideways by \d+px/, widths: [390] },
  { file: "reflow-root-left", rule: "reflow", says: /main\.oak-workspace overflows sideways by 310px/, widths: [390] },
  { file: "heading-break", rule: "heading-break", says: /"Internationalization" breaks across two lines/, widths: [390] },
];

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

const openFixture = async (name, viewport = { width: 1280, height: 800 }) => {
  const page = await browser.newPage({ viewport });
  await page.goto(fixtureUrl(name));
  return page;
};

const judgeFixture = async (page, row) => [...await judgePage(page), ...await judgeLayout(page, { widths: row.widths ?? [page.viewportSize().width] })];

test("every rule has a failing fixture and a source reference", () => {
  const covered = new Set(failing.map(row => row.rule));
  for (const rule of [...PAGE_RULE_IDS, ...LAYOUT_RULE_IDS]) {
    assert.ok(covered.has(rule), `${rule} has a failing fixture`);
    assert.ok(RULE_REFS[rule], `${rule} names the Oak-backed source it enforces`);
  }
  assert.equal(new Set([...PAGE_RULE_IDS, ...LAYOUT_RULE_IDS]).size, Object.keys(RULE_REFS).length);
});

for (const row of failing) {
  test(`${row.rule}: ${row.file}.html fails that rule alone (${row.says.source})`, async () => {
    const page = await openFixture(row.file, row.viewport);
    try {
      const found = await judgeFixture(page, row);
      assert.deepEqual([...new Set(found.map(item => item.rule))], [row.rule], found.map(describeFinding).join("\n"));
      assert.ok(found.some(item => row.says.test(item.detail)), `${row.says} in:\n${found.map(describeFinding).join("\n")}`);
    } finally { await page.close(); }
  });
}

test("the clean fixture passes every rule at all six widths", async () => {
  const page = await openFixture("clean");
  try {
    const found = [...await judgePage(page), ...await judgeLayout(page, { widths: JUDGE_WIDTHS })];
    assert.deepEqual(found.map(describeFinding), []);
  } finally { await page.close(); }
});

test("hue-count excuses candy tiles and a cover-derived accent, and counts the same colors without the mark", async () => {
  const page = await openFixture("hue-count");
  try {
    assert.equal((await judgePage(page, { rules: ["hue-count"] })).length, 1);
    await page.evaluate(() => document.querySelector(".row").setAttribute("data-cover-accent", ""));
    assert.deepEqual(await judgePage(page, { rules: ["hue-count"] }), [], "cover-derived accent");
    await page.evaluate(() => { const row = document.querySelector(".row"); row.removeAttribute("data-cover-accent"); for (const tile of row.children) tile.setAttribute("data-candy-tile", ""); });
    assert.deepEqual(await judgePage(page, { rules: ["hue-count"] }), [], "candy tiles");
  } finally { await page.close(); }
});

test("a declared reason excuses one rule on one element and nothing else", async () => {
  const page = await openFixture("card-in-card");
  try {
    await page.evaluate(() => document.querySelector(".card .card").setAttribute("data-judge-ok", "card-in-card: the proposal sheet keeps its inset card"));
    assert.deepEqual(await judgePage(page), []);
    await page.evaluate(() => document.querySelector(".card .card").setAttribute("data-judge-ok", "uneven-row: unrelated"));
    assert.equal((await judgePage(page)).length, 1);
  } finally { await page.close(); }
});

test("a kind declares why it has no picture, in the block or in the judge options", async () => {
  const page = await openFixture("no-picture");
  try {
    assert.equal((await judgePage(page, { rules: ["no-picture"] })).length, 1);
    assert.deepEqual(await judgePage(page, { rules: ["no-picture"], pictureOk: { plain: "words are the content" } }), []);
    await page.evaluate(() => document.querySelector("[data-kind=plain]").setAttribute("data-picture-ok", "words are the content"));
    assert.deepEqual(await judgePage(page, { rules: ["no-picture"] }), []);
  } finally { await page.close(); }
});

test("a chart with a recorded source passes invented-chart", async () => {
  const page = await openFixture("invented-chart");
  try {
    await page.evaluate(() => document.querySelector("[data-chart]").setAttribute("data-source", "work/oak-agent.md"));
    assert.deepEqual(await judgePage(page, { rules: ["invented-chart"] }), []);
  } finally { await page.close(); }
});

test("a dialog root's own blur and the design system's glass pass stray-blur, a static block inside the root does not", async () => {
  const page = await openFixture("stray-blur-fixed");
  try {
    assert.deepEqual((await judgePage(page, { rules: ["stray-blur"] })).map(item => item.detail), ["div.card blurs what is behind it (blur(12px)) but is not a floating layer or sheet"], "a dialog root's own blur is glass; a static block inside it is not");
    await page.evaluate(() => document.querySelector(".card").classList.add("oak-composer__surface"));
    assert.deepEqual(await judgePage(page, { rules: ["stray-blur"] }), [], "the message box is on the design system's glass list");
  } finally { await page.close(); }
});

test("a repeated finding counts once per occurrence, so a debt count sees the second copy", async () => {
  for (const [file, rule, add] of [
    ["verified-claim", "verified-claim", () => { const p = document.querySelector(".oak-openui p"); p.after(p.cloneNode(true)); }],
    ["icon-doubling", "icon-doubling", () => { const a = document.querySelector("article.card"); a.after(a.cloneNode(true)); }],
  ]) {
    const page = await openFixture(file);
    try {
      const before = await judgePage(page, { rules: [rule] });
      await page.evaluate(add);
      const found = await judgePage(page, { rules: [rule] });
      assert.equal(found.length, before.length * 2, found.map(describeFinding).join("\n"));
      assert.equal(new Set(found.map(item => item.detail)).size, before.length, "the copies carry the same detail");
    } finally { await page.close(); }
  }
});

test("a heading that wraps at its hyphen does not break a word", async () => {
  const page = await openFixture("heading-hyphen", { width: 390, height: 844 });
  try {
    assert.deepEqual((await judgeLayout(page, { widths: [390], rules: ["heading-break"] })).map(describeFinding), []);
  } finally { await page.close(); }
});

test("the judge waits for motion to stop before it measures", async () => {
  const page = await openFixture("still");
  try {
    assert.equal((await judgePage(page, { rules: ["tight-spacing"] })).length, 1, "mid-motion the buttons sit 4px apart");
    await waitForStill(page);
    assert.deepEqual((await judgePage(page, { rules: ["tight-spacing"] })).map(describeFinding), []);
  } finally { await page.close(); }
});

test("the gallery check judges page rules at 390 and layout at 320", async () => {
  assert.ok(GALLERY_PAGE_WIDTHS.includes(390) && GALLERY_LAYOUT_WIDTHS.includes(320));
  for (const width of [...GALLERY_PAGE_WIDTHS, ...GALLERY_LAYOUT_WIDTHS]) assert.ok(JUDGE_WIDTHS.includes(width), `${width} is a ticket width`);
  for (const [file, rule, width] of [["top-bar-phone", "top-bar", 390], ["reflow-narrow", "reflow", 320]]) {
    const page = await openFixture(file);
    try {
      const found = await judgeGalleryState(page);
      assert.deepEqual([...new Set(found.map(item => `${item.rule} ${item.width}`))], [`${rule} ${width}`], found.map(describeFinding).join("\n"));
    } finally { await page.close(); }
  }
});

test("tight-spacing skips a control its scroller hides and counts one it shows in part", async () => {
  const page = await openFixture("tight-spacing-clipped", { width: 390, height: 844 });
  try {
    const pairs = async () => (await judgePage(page, { rules: ["tight-spacing"] })).map(item => item.detail);
    assert.deepEqual(await pairs(), ["button.chip and button.chip are 4px apart"], "only the in-view pair counts");
    await page.evaluate(() => {
      document.querySelector(".reader").scrollTop = 96;
      document.querySelector(".composer").style.top = "104px";
    });
    assert.equal((await pairs()).length, 1, "a control half under the fold still counts on its visible part");
  } finally { await page.close(); }
});

test("tight-spacing judges a scroller at its top and at its end, and counts a pair seen in both once", async () => {
  const page = await openFixture("tight-spacing-fold", { width: 390, height: 844 });
  try {
    await page.evaluate(() => document.querySelector(".reader").scrollTo({ top: 17, behavior: "instant" }));
    const pairs = (await judgePage(page, { rules: ["tight-spacing"] })).map(item => item.detail);
    assert.equal(pairs.length, 3, `top, middle and end pairs once each:\n${pairs.join("\n")}`);
    assert.equal(await page.evaluate(() => document.querySelector(".reader").scrollTop), 17, "the scroller is put back where it was");
  } finally { await page.close(); }
});

test("a page loaded mid-scroll at 1440 counts the same as from the top", async () => {
  const page = await openFixture("tight-spacing-midscroll", { width: 1440, height: 900 });
  try {
    const count = async () => (await judgeGalleryState(page, { pageWidths: [1440], layoutWidths: [] })).filter(item => item.rule === "tight-spacing").length;
    const fromTop = await count();
    await page.evaluate(() => scrollTo(0, 1000));
    assert.equal(await count(), fromTop, "where the page was left does not change the count");
    assert.equal(fromTop, 0);
  } finally { await page.close(); }
});

test("tight-spacing measures the end of a scroller after its scroll handlers move things, so a bar that leaves on the next frame makes no pair", async () => {
  const page = await openFixture("tight-spacing-reflow", { width: 390, height: 844 });
  try {
    assert.deepEqual((await judgePage(page, { rules: ["tight-spacing"] })).map(item => item.detail), []);
  } finally { await page.close(); }
});

test("tight-spacing keeps re-placing a scroller at its end until a 24-frame glide stops pulling it away, so the two-frame wait still counts the end pair", async () => {
  const page = await openFixture("tight-spacing-glide", { width: 390, height: 844 });
  try {
    assert.deepEqual((await judgePage(page, { rules: ["tight-spacing"] })).map(item => item.detail), ["button.chip and button.chip are 4px apart"]);
  } finally { await page.close(); }
});

test("a scroller that never holds its end is a scroll-settle finding at the judged width, not a silent end pass", async () => {
  const page = await openFixture("tight-spacing-endless-glide", { width: 390, height: 844 });
  try {
    const found = (await judgeGalleryState(page, { pageWidths: [390], layoutWidths: [] })).filter(item => item.rule === "scroll-settle");
    assert.deepEqual(found, [{ rule: "scroll-settle", ref: "QJ13", width: 390, detail: "div.reader did not hold at its end after 30 placements, so its end pass measures it mid-motion" }]);
  } finally { await page.close(); }
});

test("a scroller held off its top names the top pass too, then the end pass", async () => {
  const page = await openFixture("tight-spacing-endless-glide", { width: 390, height: 844 });
  try {
    await page.evaluate(() => { const reader = document.querySelector(".reader"); const hold = () => { reader.scrollTop = 50; requestAnimationFrame(hold); }; requestAnimationFrame(hold); });
    const found = (await judgeGalleryState(page, { pageWidths: [390], layoutWidths: [] })).filter(item => item.rule === "scroll-settle").map(item => item.detail);
    assert.deepEqual(found, ["top", "end"].map(pass => `div.reader did not hold at its ${pass} after 30 placements, so its ${pass} pass measures it mid-motion`));
  } finally { await page.close(); }
});

test("tight-spacing judges an absolutely positioned pair that escapes an overflow ancestor which does not contain it", async () => {
  const page = await openFixture("tight-spacing-escape", { width: 390, height: 844 });
  try {
    assert.deepEqual((await judgePage(page, { rules: ["tight-spacing"] })).map(item => item.detail), ["button.chip and button.chip are 4px apart"]);
  } finally { await page.close(); }
});

test("tight padding names each side, so losing more padding on a listed frame is a new finding", async () => {
  const page = await openFixture("tight-spacing-padding");
  try {
    const detail = async (padding) => {
      await page.evaluate(value => { document.querySelector(".card").style.padding = value; }, padding);
      return (await judgePage(page, { rules: ["tight-spacing"] })).map(item => item.detail);
    };
    assert.deepEqual(await detail("0 16px"), ["div.card holds text with 0px padding (0 16 0 16)"]);
    assert.deepEqual(await detail("0"), ["div.card holds text with 0px padding"]);
  } finally { await page.close(); }
});

test("a debt entry excuses its finding by rule, width, state and selector, up to its count, on its platform", () => {
  const finding = { rule: "tight-spacing", ref: "R6 spacing floor", width: 1440, detail: "button.ui-button and button.ui-button are 4.2px apart" };
  assert.equal(debtDetail(finding.detail), "button.ui-button and button.ui-button are #px apart");
  assert.equal(debtDetail("h2.oak-card__title in oak-openui-2 at 0.04 and 2.14:1"), "h2.oak-card__title in oak-openui-2 at # and #:#");
  const debt = [{ rule: "tight-spacing", width: 1440, detail: debtDetail(finding.detail), states: { empty: 1 }, worst: { 0: 2.5 } }];
  assert.deepEqual(unlistedFindings(debt, "empty", [finding]).unlisted, []);
  assert.equal(unlistedFindings(debt, "empty", [finding, finding]).unlisted.length, 1, "a second copy fails");
  assert.equal(unlistedFindings(debt, "advice", [finding]).unlisted.length, 1, "another state fails");
  assert.deepEqual(unlistedFindings(debt, "empty", [{ ...finding, detail: "button.ui-button and button.ui-button are 2.5px apart" }]).unlisted, [], "a font-metric number does not change the key");
  assert.equal(unlistedFindings(debt, "empty", [{ ...finding, detail: "button.ui-marker and button.ui-button are 4.2px apart" }]).unlisted.length, 1, "another selector fails");
  assert.equal(unlistedFindings(debt, "empty", [{ ...finding, width: 390 }]).unlisted.length, 1, "another width fails");
  const linux = [{ ...debt[0], platform: "linux" }];
  assert.deepEqual(unlistedFindings(linux, "empty", [finding], "linux").unlisted, []);
  assert.equal(unlistedFindings(linux, "empty", [finding], "darwin").unlisted.length, 1, "a Linux entry does not excuse a Mac finding");
  assert.deepEqual(staleDebt(linux, new Map(), "darwin"), [], "a Linux entry is not stale on a Mac");
  assert.equal(staleDebt(linux, new Map(), "linux").length, 1);
});

const boundary = [
  { rule: "tight-spacing", file: "tight-spacing", apply: v => { document.querySelector(".row").style.gap = v + "px"; }, under: 7, at: 8 },
  { rule: "tight-spacing", file: "tight-spacing-padding", apply: v => { document.querySelector(".card").style.padding = v + "px"; }, under: 11, at: 12 },
  { rule: "uneven-row", file: "uneven-row", apply: v => { document.querySelectorAll(".card")[1].style.height = v + "px"; }, under: 123, at: 122 },
  { rule: "metric-numeral", file: "metric-numeral", apply: v => { const n = document.querySelector("[data-metric-numeral]"); n.className = "num"; n.style.fontSize = v + "px"; }, under: 39, at: 40 },
  { rule: "capsule-radius", file: "capsule-radius", apply: v => { document.querySelector("button").style.borderRadius = v + "px"; }, under: 16, at: 17 },
  { rule: "white-panel", file: "white-panel", apply: v => { const card = document.querySelector(".card"); card.style.background = v; card.style.borderColor = v; }, under: "#cccccc", at: "#c8c8c8" },
  { rule: "glass-contrast", file: "glass-contrast", apply: v => { document.querySelector("[role=dialog]").style.color = v; }, under: "#787878", at: "#707070" },
  { rule: "dense-paragraph", file: "dense-paragraph", apply: v => { document.querySelector(".oak-openui").innerHTML = `<dl><dd>${Array(v).fill("word").join(" ")}</dd></dl>`; }, under: 26, at: 25 },
  { rule: "card-in-card", file: "card-in-card", apply: v => { for (const card of document.querySelectorAll(".card")) card.style.borderRadius = v + "px"; }, under: 12, at: 11 },
];

for (const row of boundary) {
  test(`${row.rule}: ${row.file}.html fires just under its limit (${row.under}) and passes at it (${row.at})`, async () => {
    const page = await openFixture(row.file);
    try {
      await page.evaluate(row.apply, row.under);
      assert.ok((await judgePage(page, { rules: [row.rule] })).length, `${row.under} fires`);
      await page.evaluate(row.apply, row.at);
      assert.deepEqual((await judgePage(page, { rules: [row.rule] })).map(describeFinding), [], `${row.at} passes`);
    } finally { await page.close(); }
  });
}

test("a rule that throws becomes a finding, so the gallery check fails it instead of passing a blind page", async () => {
  const page = await openFixture("clean");
  try {
    const found = await judgePage(page, { rules: ["case-image-frame"], caseImage: "!!" });
    assert.equal(found.length, 1);
    assert.match(found[0].detail, /^judge error: /);
    assert.equal(unlistedFindings([], "empty", found).unlisted.length, 1, "no debt entry can excuse it");
  } finally { await page.close(); }
});

test("text-overlap and reflow count every finding, so a debt count sees a ninth", async () => {
  const overlap = await openFixture("text-overlap");
  try {
    await overlap.evaluate(() => { const box = document.querySelector("main > div"); for (let i = 0; i < 9; i++) box.after(box.cloneNode(true)); });
    assert.equal((await judgeLayout(overlap, { widths: [1280], rules: ["text-overlap"] })).length, 10);
  } finally { await overlap.close(); }
  const reflow = await openFixture("reflow");
  try {
    await reflow.evaluate(() => { const p = document.querySelector("p"); for (let i = 0; i < 9; i++) p.after(p.cloneNode(true)); });
    assert.equal((await judgeLayout(reflow, { widths: [1280], rules: ["reflow"] })).length, 10);
  } finally { await reflow.close(); }
});

test("waitForStill says when the page never stopped, and the gallery check records it as a finding", async () => {
  const page = await openFixture("still");
  try {
    assert.equal(await waitForStill(page, { timeout: 100 }), false);
    assert.equal(await waitForStill(page), true);
    const hurried = (await judgeGalleryState(page, { settleTimeout: 100 })).filter(item => item.rule === "settle");
    assert.deepEqual(hurried.map(item => item.width), [320, 390, 1440]);
    assert.match(describeFinding(hurried[0]), /still moving after 100ms/);
    assert.deepEqual((await judgeGalleryState(page)).filter(item => item.rule === "settle"), []);
  } finally { await page.close(); }
});

test("the gallery check loads the page at each width, so a component that reads its width on mount is judged at it", async () => {
  const page = await openFixture("mount-width");
  try {
    const found = await judgeGalleryState(page);
    assert.deepEqual([...new Set(found.map(item => `${item.rule} ${item.width}`))], ["reflow 320"], found.map(describeFinding).join("\n"));
  } finally { await page.close(); }
});

test("a debt entry that allows more than it now sees is stale, so a tightened state frees its slack", () => {
  const debt = [{ rule: "tight-spacing", width: 1440, detail: "a and b are #px apart", states: { empty: 2 } }];
  assert.equal(staleDebt(debt, new Map([["0|empty", 1]]), "darwin").length, 1);
  assert.deepEqual(staleDebt(debt, new Map([["0|empty", 2]]), "darwin"), []);
  assert.equal(staleDebt(debt, new Map(), "darwin").length, 1);
});

test("a variant state with judgeLike inherits its base state's debt up to the base's count, and does not use up the base", () => {
  const finding = { rule: "tight-spacing", ref: "x", width: 1440, detail: "a and b are 4px apart" };
  const debt = [{ rule: "tight-spacing", width: 1440, detail: "a and b are #px apart", states: { base: 2 }, worst: { 0: 4 } }];
  assert.equal(unlistedFindings(debt, "variant", [finding, finding], "darwin").unlisted.length, 1, "without judgeLike a variant has no allowance");
  assert.deepEqual(unlistedFindings(debt, "variant", [finding, finding], "darwin", "base").unlisted, []);
  assert.match(unlistedFindings(debt, "variant", [finding, finding, finding], "darwin", "base").unlisted[0], /^variant: .*3 times, 2 listed/);
  assert.equal(unlistedFindings(debt, "variant", [{ ...finding, detail: "a and b are 3px apart" }], "darwin", "base").unlisted.length, 1, "worse than the base's worst number fails");
  const own = [{ ...debt[0], states: { base: 2, variant: 1 } }];
  assert.equal(unlistedFindings(own, "variant", [finding, finding], "darwin", "base").unlisted.length, 1, "a variant's own count replaces the base's");
  const used = new Map();
  for (const { entry, stateId, seen } of unlistedFindings(debt, "variant", [finding, finding], "darwin", "base").used) used.set(`${debt.indexOf(entry)}|${stateId}`, seen);
  assert.deepEqual(staleDebt(debt, used, "darwin"), ["base: tight-spacing at 1440px: a and b are #px apart (lists 2, saw 0)"], "inherited use does not count for the base");
});

const designReadProblems = bar => {
  const read = bar.slice(bar.indexOf("async function readDesign"), bar.indexOf("if (flags.gallery)"));
  const states = read.match(/const states = [^;]+;/)?.[0] ?? "";
  // rl15 L4: the list is the gallery's own objects, filtered by id; any map, spread, Array.from or for copy can drop judgeLike.
  const filteredOnly = /^const states = \(Array\.isArray\(all\) \? all : all\.states\)\.filter\(\(state\) => [^;{}]*\.test\(state\.id\)\);$/.test(states);
  return [
    !/judgeStates\(browser, url, states, /.test(read) && "readDesign judges the gallery states through judgeStates",
    !/compareDebt\(debt, findings, \{ like: judgeLikes\(states\) \}\)/.test(read) && "readDesign checks the findings with compareDebt and the states' judgeLike",
    /unlistedFindings|judgeGalleryState/.test(read) && "readDesign keeps no judge loop of its own",
    (!filteredOnly || /\bstates\s*(?:=[^=]|\.(?:push|splice|unshift)\()/.test(read.replace(states, ""))) && "readDesign's states list keeps every field, judgeLike included (r185 P3-1)",
  ].filter(Boolean);
};

test("the quality bar's design capsule judges through judgeStates and checks through compareDebt, which reads judgeLike as judge-debt does", () => {
  const bar = readFileSync(new URL("../../../scripts/quality/quality-bar.mjs", import.meta.url), "utf8");
  assert.deepEqual(designReadProblems(bar), []);
  const mapped = bar.replace(/(const states = [^;]+);/, "$1.map(({ id }) => ({ id }));");
  assert.notEqual(mapped, bar, "the states line is where the guard expects it");
  assert.deepEqual(designReadProblems(mapped), ["readDesign's states list keeps every field, judgeLike included (r185 P3-1)"], "a mapped states list that drops judgeLike fails the guard");
});

test("rl15 L4: the design capsule guard fails on any copy that can drop judgeLike, not only .map(", () => {
  const bar = readFileSync(new URL("../../../scripts/quality/quality-bar.mjs", import.meta.url), "utf8");
  const source = "(Array.isArray(all) ? all : all.states)";
  const copies = {
    flatMap: line => line.replace(/;$/, ".flatMap(({ id }) => [{ id }]);"),
    "Array.from": line => line.replace("const states = ", "const states = Array.from(").replace(/;$/, ", ({ id }) => ({ id }));"),
    spread: line => line.replace(source, `[...${source}].filter(Boolean)`).replace(/;$/, ".flatMap((state) => [{ ...state, judgeLike: undefined }]);"),
    "for copy": () => `const states = []; for (const { id } of ${source}) if (/^(answer-openui-|openui-)/.test(id)) states.push({ id });`,
  };
  for (const [name, copy] of Object.entries(copies)) {
    const changed = bar.replace(/const states = [^;]+;/, line => copy(line));
    assert.notEqual(changed, bar, name);
    assert.deepEqual(designReadProblems(changed), ["readDesign's states list keeps every field, judgeLike included (r185 P3-1)"], name);
  }
});

const missingLikes = states => states.filter(state => state.judgeLike !== undefined && !states.some(other => other.id === state.judgeLike && other !== state)).map(state => `${state.id} has judgeLike "${state.judgeLike}", which names no gallery state`);

test("a gallery state's judgeLike names another gallery state", () => {
  assert.deepEqual(missingLikes([{ id: "base" }, { id: "variant", judgeLike: "base" }, { id: "lost", judgeLike: "gone" }]), ['lost has judgeLike "gone", which names no gallery state']);
  assert.deepEqual(missingLikes(galleryStates), []);
  assert.ok(galleryStates.some(state => state.judgeLike), "at least one gallery state inherits its base's debt");
});

test("a swapped shadow is a new finding, because elevation debt keeps the shadow's numbers", () => {
  const shadow = n => ({ rule: "elevation-tier", ref: "x", width: 390, detail: `div.oak-composer__surface lifts with "0px ${n}px 80px rgba(255, 0, 0, 0.9)", outside the three elevation tiers` });
  const debt = [{ rule: "elevation-tier", width: 390, detail: shadow(8).detail, states: { empty: 1 } }];
  assert.deepEqual(unlistedFindings(debt, "empty", [shadow(8)]).unlisted, []);
  assert.equal(unlistedFindings(debt, "empty", [shadow(30)]).unlisted.length, 1);
});

test("a listed finding that gets worse fails, because the entry keeps the worst number it allows", () => {
  assert.deepEqual(severitySlots("tight-spacing", "a and b are #px apart"), { 0: "down" });
  assert.deepEqual(severitySlots("tight-spacing", "div holds text with #px padding (# # # #)"), { 0: "down" });
  assert.deepEqual(severitySlots("glass-contrast", "div (fill alpha #) leaves div at #:# over the brightest text behind it"), { 1: "down" });
  assert.deepEqual(severitySlots("dense-paragraph", "dd packs # words into one cell"), { 0: "up" });
  assert.deepEqual(severitySlots("card-in-card", "a sits inside card b"), {});
  const entry = (rule, detail, worst) => [{ rule, width: 390, detail: debtDetail(detail), states: { empty: 1 }, worst }];
  const run = (debt, rule, detail) => unlistedFindings(debt, "empty", [{ rule, ref: "x", width: 390, detail }]).unlisted.length;
  const gap = entry("tight-spacing", "a and b are 4px apart", { 0: 4 });
  assert.equal(run(gap, "tight-spacing", "a and b are 4px apart"), 0);
  assert.equal(run(gap, "tight-spacing", "a and b are 6.5px apart"), 0, "a wider gap is better");
  assert.equal(run(gap, "tight-spacing", "a and b are 3.9px apart"), 1, "a smaller gap is worse");
  const glass = entry("glass-contrast", "div (fill alpha 0.20) leaves div at 3.54:1 over the brightest text behind it", { 1: 3.54 });
  assert.equal(run(glass, "glass-contrast", "div (fill alpha 0.20) leaves div at 3.9:1 over the brightest text behind it"), 0);
  assert.equal(run(glass, "glass-contrast", "div (fill alpha 0.20) leaves div at 2.1:1 over the brightest text behind it"), 1, "a lower ratio is worse");
  const dense = entry("dense-paragraph", "dd packs 30 words into one cell", { 0: 30 });
  assert.equal(run(dense, "dense-paragraph", "dd packs 31 words into one cell"), 1, "more words is worse");
  assert.equal(run(entry("dense-paragraph", "dd packs 30 words into one cell", undefined), "dense-paragraph", "dd packs 30 words into one cell"), 1, "an entry that recorded no worst number excuses nothing");
});

test("every debt entry is complete and keeps the worst number it allows", () => {
  const debt = readJson("known-debt");
  for (const entry of debt) assert.ok(entry.reason && entry.ticket && entry.rule && entry.width && entry.detail === debtDetail(entry.detail, entry.rule) && [undefined, "linux", "darwin"].includes(entry.platform) && entry.states && !Array.isArray(entry.states) && Object.values(entry.states).every(n => Number.isInteger(n) && n > 0), `debt entry is complete: ${JSON.stringify(entry)}`);
  for (const entry of debt) assert.deepEqual(Object.keys(entry.worst ?? {}).sort(), Object.keys(severitySlots(entry.rule, entry.detail)).sort(), `debt entry keeps the worst number it allows: ${JSON.stringify(entry)}`);
});

// JUDGE_SLICE=i/n judges the gallery states whose index is i modulo n (i from 0). A slice checks its own findings;
// stale debt needs every state, so judge-merge.test.mjs checks it over all slices' JUDGE_FINDINGS_OUT files.
const slice = (spec) => {
  if (!spec) return null;
  const [index, count] = spec.split("/").map(Number);
  if (!(Number.isInteger(index) && Number.isInteger(count) && index >= 0 && index < count)) throw new Error(`JUDGE_SLICE is i/n with 0 <= i < n, not "${spec}"`);
  return { index, count };
};

// JUDGE_STATES=a,b judges only the named gallery states (ticket 312, the Linux judge preflight); like a slice it skips
// the stale check. A name that is not a gallery state is an error, so a typo never judges nothing and passes.
const namedStates = (spec, states) => {
  if (!spec) return null;
  const ids = [...new Set(spec.split(",").map(s => s.trim()).filter(Boolean))];
  const missing = ids.filter(id => !states.some(state => state.id === id));
  if (!ids.length || missing.length) throw new Error(`JUDGE_STATES names gallery states by id, comma separated; not one: ${missing.join(", ") || JSON.stringify(spec)}`);
  return states.filter(state => ids.includes(state.id));
};

test("JUDGE_STATES picks the named gallery states in gallery order and refuses a name that is not one", () => {
  const states = [{ id: "empty" }, { id: "advice" }, { id: "answer-openui-settled" }];
  assert.equal(namedStates(undefined, states), null);
  assert.deepEqual(namedStates("answer-openui-settled, empty,empty", states).map(s => s.id), ["empty", "answer-openui-settled"]);
  assert.throws(() => namedStates("empty,emty", states), /not one: emty/);
  assert.throws(() => namedStates(",", states), /JUDGE_STATES/);
});

test("every gallery state passes the judge or its finding is listed in known-debt.json with a reason and a ticket", async () => {
  const debt = readJson("known-debt");
  assert.deepEqual(missingLikes(galleryStates), []);
  const part = slice(process.env.JUDGE_SLICE);
  const only = namedStates(process.env.JUDGE_STATES, galleryStates);
  if (part && only) throw new Error("JUDGE_SLICE and JUDGE_STATES each pick the states; set one");
  const states = only ?? (part ? galleryStates.filter((_, i) => i % part.count === part.index) : galleryStates);
  const { findings } = await judgeStates(browser, galleryUrl, states, {});
  if (process.env.JUDGE_FINDINGS_OUT) writeFileSync(process.env.JUDGE_FINDINGS_OUT, JSON.stringify(findings));
  const result = compareDebt(debt, findings, { like: judgeLikes(galleryStates) });
  const unlisted = result.unlisted.map(row => row.detail);
  const stale = part || only ? [] : result.stale;
  const refresh = unlisted.length || stale.length ? `\n${refreshCommand(process.platform === "darwin" ? "darwin" : "linux")}` : "";
  assert.deepEqual({ unlisted: unlisted.sort(), stale }, { unlisted: [], stale: [] }, `${unlisted.length} unlisted findings, ${stale.length} stale debt states (delete them)${refresh}`);
});

test("each debt reason names its real cause, and the dev gallery's figure wrapper is not filed as agent chrome", () => {
  const debt = readJson("known-debt");
  for (const entry of debt) assert.ok(!/^wave 1 debt in/.test(entry.reason) && !/fix round 1/.test(entry.reason), `reason names a cause: ${entry.reason}`);
  const blur = debt.filter(entry => entry.rule === "stray-blur");
  assert.ok(blur.length);
  for (const entry of blur) assert.match(entry.reason, /OakStatesGallery\.tsx/);
});

const gap = (platform, state, n, width = 1440) => ({ platform, state, rule: "tight-spacing", width, detail: `button.a and button.b are ${n}px apart` });
const old = [{ rule: "tight-spacing", width: 1440, detail: "button.a and button.b are #px apart", states: { empty: 1 }, ticket: "23", reason: "the research cite links" }];

test("states both platforms share merge into one entry with the worst number of either", () => {
  const out = rebuildDebt(old, [gap("darwin", "empty", 4.2), gap("linux", "empty", 2.5)]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { rule: "tight-spacing", width: 1440, detail: "button.a and button.b are #px apart", states: { empty: 1 }, worst: { 0: 2.5 }, ticket: "23", reason: "the research cite links" });
});

test("states that differ by platform split into platform entries, each with its own worst number", () => {
  const out = rebuildDebt(old, [gap("darwin", "empty", 4.2), gap("linux", "empty", 2.5), gap("linux", "advice", 3)]);
  assert.deepEqual(out.map(e => [e.platform, e.states, e.worst]), [["darwin", { empty: 1 }, { 0: 4.2 }], ["linux", { empty: 1, advice: 1 }, { 0: 2.5 }]]);
});

test("a platform with no findings keeps what the old debt lists for it, and its worst number", () => {
  const before = [{ ...old[0], states: { empty: 2 }, worst: { 0: 1.5 } }];
  const out = rebuildDebt(before, [gap("darwin", "empty", 4.2), gap("darwin", "empty", 4.2)]);
  assert.deepEqual(out.map(e => [e.platform, e.states, e.worst]), [[undefined, { empty: 2 }, { 0: 1.5 }]]);
  const split = rebuildDebt(before, [gap("darwin", "advice", 4.2)]);
  assert.deepEqual(split.map(e => [e.platform, e.states, e.worst]), [["darwin", { advice: 1 }, { 0: 4.2 }], ["linux", { empty: 2 }, { 0: 1.5 }]]);
});

test("each finding adds one to its state, and a key with no severity carries no worst", () => {
  const out = rebuildDebt([{ rule: "card-in-card", width: 390, detail: "a sits inside card b", states: {}, ticket: "23", reason: "r" }], ["empty", "empty", "advice"].map(state => ({ platform: "linux", state, rule: "card-in-card", width: 390, detail: "a sits inside card b" })));
  assert.deepEqual(out.map(e => [e.platform, e.states, e.worst]), [["linux", { empty: 2, advice: 1 }, undefined]]);
});

test("a new rule on a new state gets its ticket and reason from the state-to-ticket table", () => {
  const found = state => ({ platform: "linux", state, rule: "white-panel", width: 390, detail: "div paints a bright 120x80 panel" });
  const out = rebuildDebt(old, [found("empty"), found("answer-openui-stats"), found("openui-figure")]);
  assert.deepEqual(out.filter(e => e.platform === "linux").map(e => [e.states, e.ticket]), [[{ empty: 1 }, "23"], [{ "answer-openui-stats": 1 }, "57"], [{ "openui-figure": 1 }, "109"]]);
  for (const entry of out.filter(e => e.platform === "linux")) assert.match(entry.reason, /white-panel at 390px, div paints a bright # panel/);
  assert.deepEqual([ticketFor("empty"), ticketFor("table-matrix-4"), ticketFor("openui-figure-four-series")], ["23", "57", "109"]);
});

test("a rule the old debt already lists keeps its own ticket and reason on a new state", () => {
  const out = rebuildDebt(old, [gap("linux", "openui-figure", 3)]);
  assert.deepEqual(out.map(e => [e.platform, e.states, e.ticket, e.reason]), [["darwin", { empty: 1 }, "23", "the research cite links"], ["linux", { "openui-figure": 1 }, "23", "the research cite links"]]);
});

test("new-block states file their debt under 57 and step peeks under 26, and a rebuild moves a catch-all 23 entry to its blocks' ticket", () => {
  assert.deepEqual(["screens-three", "diagram-flow-oakminder", "page-cards-streaming", "evidence-chart-two", "contact-card-focus", "site-card-tour", "role-entry-linked", "metric-kind-delta", "step-peeks-open", "empty", "role-fit-answer"].map(ticketFor), ["57", "57", "57", "57", "57", "57", "57", "57", "26", "23", "23"]);
  const chrome = { rule: "card-in-card", width: 390, detail: "a sits inside card b", ticket: "23", reason: "agent chrome and states: card-in-card at 390px, a sits inside card b" };
  const out = rebuildDebt([{ ...chrome, states: { "screens-three": 1, "diagram-flow": 1 } }, { ...chrome, width: 1440, states: { "screens-three": 1, empty: 1 } }], []);
  assert.deepEqual(out.map(e => [e.width, e.ticket, e.reason]), [[390, "57", "OpenUI answer blocks: card-in-card at 390px, a sits inside card b"], [1440, "23", chrome.reason]]);
});

test("a rebuild drops a variant state's count when its base state lists as many, and keeps it when the variant adds findings", () => {
  const like = new Map([["variant", "base"]]);
  const out = rebuildDebt([{ ...old[0], states: { base: 2, variant: 2 } }, { ...old[0], width: 390, states: { base: 1, variant: 2 } }], [], { like });
  assert.deepEqual(out.map(e => [e.width, e.states]), [[390, { base: 1, variant: 2 }], [1440, { base: 2 }]]);
  const fresh = rebuildDebt(old, [gap("darwin", "empty", 4), gap("darwin", "variant", 4)], { like: new Map([["variant", "empty"]]) });
  assert.deepEqual(fresh.map(e => [e.platform, e.states]), [[undefined, { empty: 1 }]]);
});

test("a darwin-only refresh leaves the Linux entries as they were", () => {
  const before = [{ ...old[0], platform: "linux", states: { empty: 1, advice: 2 }, worst: { 0: 2.5 } }, { ...old[0], platform: "darwin", states: { empty: 1 }, worst: { 0: 4 } }];
  const out = rebuildDebt(before, [gap("darwin", "empty", 3.5), gap("darwin", "saved-list", 3.5)]);
  assert.deepEqual(out.filter(e => e.platform === "linux"), [before[0]]);
  assert.deepEqual(out.find(e => e.platform === "darwin").states, { empty: 1, "saved-list": 1 });
});

test("a Linux refresh keeps an optional state optional and the darwin entries", () => {
  const detail = "li.oak-cot__step holds # icons (thought, clock)";
  const before = [
    { rule: "icon-doubling", width: 390, detail, platform: "linux", states: { "reasoning-thoughts": 1 }, optional: ["reasoning-thoughts"], ticket: "23", reason: "timing" },
    { rule: "icon-doubling", width: 390, detail, platform: "darwin", states: { "reasoning-thoughts": 1 }, ticket: "23", reason: "timing" },
  ];
  const out = rebuildDebt(before, [{ platform: "linux", state: "reasoning-wait", rule: "icon-doubling", width: 390, detail: "li.oak-cot__step holds 2 icons (thought, clock)" }]);
  assert.deepEqual(out.map(e => [e.platform, e.states, e.optional]), [["darwin", { "reasoning-thoughts": 1 }, undefined], ["linux", { "reasoning-thoughts": 1, "reasoning-wait": 1 }, ["reasoning-thoughts"]]]);
});

test("the Linux refresh hint names the CircleCI artifact, and judge-debt no longer reads Depot", () => {
  assert.match(refreshCommand("linux"), /gh run download <run id> -R oak-portfolio\/site-ci -n shard-0 -D \/tmp\/site-ci; node scripts\/design-policy\/judge-debt\.mjs \/tmp\/site-ci\/judge-findings\.json, then commit known-debt\.json/);
  assert.doesNotMatch(readFileSync(new URL("../../../scripts/design-policy/judge-debt.mjs", import.meta.url), "utf8"), /depot/i);
  assert.match(refreshCommand("darwin"), /JUDGE_FINDINGS_OUT=.*node scripts\/design-policy\/judge-debt\.mjs/);
});

test("an unknown platform stops the refresh", () => {
  assert.throws(() => rebuildDebt(old, [gap("win32", "empty", 4)]), /unknown platform win32/);
});

test("findings are read from a JSON file or from the line a failed ui log prints", () => {
  const rows = [gap("linux", "empty", 4)];
  assert.deepEqual(readFindings(JSON.stringify(rows)), rows);
  assert.deepEqual(readFindings(`noise\nAssertionError: 1 unlisted\njudge-findings ${JSON.stringify(rows)}'\nmore`), rows);
  assert.throws(() => readFindings("nothing here"), /no judge-findings line/);
});

test("judge-debt reads the last findings line that parses when a retry's line is cut short", () => {
  const rows = [{ platform: "linux", state: "empty", rule: "tight-spacing", width: 390, detail: "a and b are 4px apart" }];
  assert.deepEqual(readFindings(`judge-findings ${JSON.stringify(rows)}\nretry\njudge-findings ${JSON.stringify(rows).slice(0, 40)}`), rows);
});

test("judge-debt reads the framed findings block the ui job prints, skipping other suites' lines and a cut old line", () => {
  const rows = [gap("linux", "empty", 4), { platform: "linux", state: "answer-openui-source", rule: "card-in-card", width: 390, detail: "div.oak-openui-source__page is a wrapper around span.oak-openui-source__scrim" }];
  const block = (lines) => ["judge-findings-begin", ...lines, "judge-findings-end"].join("\n");
  const cut = `  judge-findings ${JSON.stringify(rows).slice(0, 120)}✔ D30-G1 every icon-only control names itself on hover within 400 ms, disabled Send included (26774.633974ms)`;
  assert.deepEqual(readFindings(`noise\n${block(rows.map((r) => JSON.stringify(r)))}\nmore`), rows);
  assert.deepEqual(readFindings(`${cut}\nℹ tests 1\n${block([JSON.stringify(rows[0]), "ℹ suites 0", "ℹ pass 1", JSON.stringify(rows[1])])}`), rows);
  assert.deepEqual(readFindings(`${block([])}\nnoise`), []);
  assert.deepEqual(readFindings(`noise\njudge-findings ${JSON.stringify(rows)}\nmore`), rows);
  assert.throws(() => readFindings("ℹ tests 1\nℹ pass 1"), /no judge-findings line/);
});

test("judge-debt keeps an optional state listed and marked when a fresh run does not show it", () => {
  const detail = "li.oak-cot__step holds # icons (thought, clock)";
  const old = [390, 1440].map(width => ({ rule: "icon-doubling", width, detail, states: { "reasoning-thoughts": 1 }, optional: ["reasoning-thoughts"], ticket: "23", reason: "timing" }));
  const out = rebuildDebt(old, [{ platform: "linux", state: "reasoning-thoughts", rule: "icon-doubling", width: 1440, detail: "li.oak-cot__step holds 2 icons (thought, clock)" }]);
  assert.deepEqual(out.map(e => [e.width, e.platform ?? "both", e.states, e.optional]), [[390, "both", { "reasoning-thoughts": 1 }, ["reasoning-thoughts"]], [1440, "both", { "reasoning-thoughts": 1 }, ["reasoning-thoughts"]]]);
});

test("a debt entry marked optional for a state is not stale when that state does not show it", () => {
  const debt = [{ rule: "tight-spacing", width: 1440, detail: "a and b are #px apart", states: { empty: 1 }, optional: ["empty"] }];
  assert.deepEqual(staleDebt(debt, new Map(), "darwin"), []);
});

test("compareDebt reads findings arrays alone: 1280 as 1440, a judgeLike variant, an optional state, a worse number and a stale row", () => {
  const row = (state, n, width = 1280) => ({ platform: "darwin", state, rule: "tight-spacing", width, detail: `a and b are ${n}px apart` });
  const entry = (states, extra = {}) => ({ rule: "tight-spacing", width: 1440, detail: "a and b are #px apart", states, worst: { 0: 4 }, ticket: "x", reason: "r", ...extra });
  const at1440 = compareDebt([entry({ base: 1 })], [row("base", 4)], { platform: "darwin" });
  assert.deepEqual({ unlisted: at1440.unlisted, stale: at1440.stale }, { unlisted: [], stale: [] }, "a 1280 finding uses the 1440 entry");
  assert.deepEqual(compareDebt([entry({ base: 1 })], [row("base", 4), row("base", 4)], { platform: "darwin" }).unlisted, [{ state: "base", width: 1280, detail: "base: tight-spacing (R6 spacing floor, 1280px): a and b are 4px apart (2 times, 1 listed)" }], "the row names the width it was judged at");
  const like = judgeLikes([{ id: "base" }, { id: "variant", judgeLike: "base" }]);
  assert.deepEqual([...like], [["variant", "base"]]);
  assert.deepEqual(compareDebt([entry({ base: 1 })], [row("variant", 4)], { platform: "darwin", like }), { unlisted: [], stale: ["base: tight-spacing at 1440px: a and b are #px apart (lists 1, saw 0)"], used: new Map([["0|variant", 1]]) }, "the variant inherits the base's count and does not use it up");
  assert.equal(compareDebt([entry({ base: 1 })], [row("variant", 4)], { platform: "darwin" }).unlisted.length, 1, "without judgeLike a variant has no allowance");
  assert.deepEqual(compareDebt([entry({ base: 1 }, { optional: ["base"] })], [], { platform: "darwin" }).stale, [], "an optional state that does not show is not stale");
  assert.match(compareDebt([entry({ base: 1 })], [row("base", 3)], { platform: "darwin" }).unlisted[0].detail, /^base: tight-spacing \(R6 spacing floor, 1280px\): a and b are 3px apart \(worse than the \{"0":4\} its debt entry allows\)$/);
  assert.deepEqual(compareDebt([entry({ base: 2 })], [row("base", 4, 1440)], { platform: "darwin" }).stale, ["base: tight-spacing at 1440px: a and b are #px apart (lists 2, saw 1)"]);
  assert.deepEqual(compareDebt([entry({ base: 2 }, { platform: "linux" })], [], { platform: "darwin" }).stale, [], "another platform's row is not stale here");
});

test("compareDebt over two slices' findings gives what it gives over the whole pass", () => {
  const debt = [{ rule: "tight-spacing", width: 390, detail: "a and b are #px apart", states: { one: 1, two: 2, gone: 1 }, worst: { 0: 4 }, ticket: "x", reason: "r" }];
  const found = ["one", "two", "two", "three"].map((state) => ({ platform: "linux", state, rule: "tight-spacing", width: 390, detail: "a and b are 4px apart" }));
  const whole = compareDebt(debt, found, { platform: "linux" });
  const merged = compareDebt(debt, [...found.filter((_, i) => i % 2 === 1), ...found.filter((_, i) => i % 2 === 0)], { platform: "linux" });
  assert.deepEqual({ unlisted: merged.unlisted, stale: merged.stale }, { unlisted: whole.unlisted, stale: whole.stale });
  assert.deepEqual(whole.stale, ["gone: tight-spacing at 390px: a and b are #px apart (lists 1, saw 0)"]);
  assert.deepEqual(whole.unlisted.map((row) => row.state), ["three"]);
});

test("the debt report names rows that rose or dropped per platform, and a rise the other platform already lists", () => {
  const row = (states, platform) => ({ rule: "tight-spacing", width: 390, detail: "a and b are #px apart", states, ...(platform ? { platform } : {}), worst: { 0: 4 }, ticket: "23", reason: "r" });
  const before = [row({ one: 1 }, "darwin"), row({ two: 2 }, "linux")];
  const after = [row({ one: 1 }), row({ two: 1, three: 1 }, "linux")];
  assert.deepEqual(debtChanges(before, after).map(formatChange), [
    "rose linux tight-spacing at 390px: a and b are #px apart: 2 states (one 0->1, three 0->1)",
    "dropped linux tight-spacing at 390px: a and b are #px apart: 1 state (two 2->1)",
  ]);
  assert.deepEqual(debtChanges([row({ one: 1 }, "darwin")], [row({ one: 1 })]).map((change) => [change.change, change.platform, change.matches]), [["rose", "linux", "darwin"]], "a darwin row that became shared rises on Linux and matches darwin");
  assert.deepEqual(debtChanges(after, after), []);
});

test("a rebuild with a rise note appends it to each entry that rose on some platform, and only those", () => {
  const finding = (state, platform = "linux") => ({ platform, state, rule: "tight-spacing", width: 1440, detail: "button.a and button.b are 4px apart" });
  const out = rebuildDebt(old, [finding("empty"), finding("empty", "darwin"), finding("advice")], { riseNote: "ruling 90" });
  assert.deepEqual(out.map((e) => [e.platform, e.reason]), [["darwin", "the research cite links"], ["linux", "the research cite links; ruling 90"]]);
  assert.equal(rebuildDebt(old, [finding("empty"), finding("empty", "darwin")], { riseNote: "ruling 90" })[0].reason, "the research cite links", "no rise, no note");
});
