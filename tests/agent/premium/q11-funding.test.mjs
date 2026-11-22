import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "./gallery.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const open = async (page, state) => {
  await openState(page, state);
};
const withPage = async (viewport, run) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport })); } finally { await browser.close(); }
};
const read = file => readFileSync(file, "utf8");

test("Q11-G1 the 4-hour refill line gives way to the real rule once the 30-day cap is the lower limit", () => {
  const { oakAllowanceSummary } = loadTsx("src/lib/oakAllowance.ts");
  const status = (remaining, windowLeft, refillsAt = null) => ({ kind: "guest", configured: true,
    allowance: { answers: { limit: 6, remaining, refillsAt }, window: { completed: 100 - windowLeft, pending: 0, limit: 100, remaining: windowLeft } } });
  const full = oakAllowanceSummary(status(6, 90));
  assert.match(full.reset, /^Full now\./);
  assert.match(oakAllowanceSummary(status(2, 90, Date.UTC(2026, 9, 17, 20))).reset, /^Next answer back at /);
  const capped = oakAllowanceSummary(status(6, 1));
  assert.equal(capped.reset, "Each answer comes back 30 days after you used it.");
  assert.doesNotMatch(capped.note, /^One answer comes back every 4 hours/, "the capped note no longer promises a 4-hour refill");
  assert.match(capped.note, /30 days after you used it/);
  // R3 review: an empty 30-day window binds even when the 4-hour refill is also empty, so no line promises a refill time.
  const empty = oakAllowanceSummary(status(0, 0, Date.UTC(2026, 9, 17, 20)));
  assert.equal(empty.reset, "Each answer comes back 30 days after you used it.");
  assert.match(empty.note, /30 days after you used it/);
  assert.doesNotMatch(`${empty.detail} ${empty.reset} ${empty.note}`, /Next (one|answer) back at/);
});

test("Q11-G1 the allowance ring opens an in-place popover with the count, reset time and the three ways to keep going", async () => {
  const composer = read("src/components/agent/OakComposer.tsx");
  assert.match(composer, /from "@\/components\/ui\/popover"/, "a Base UI Popover, not a hover-only card");
  assert.doesNotMatch(composer, /PreviewCard/);
  await withPage({ width: 1440, height: 900 }, async page => {
    await open(page, "allowance-guest");
    await page.getByRole("button", { name: /^Answers left:/ }).click();
    const card = page.locator(".oak-usage-card");
    await card.waitFor({ state: "visible", timeout: 3000 });
    // R17: the one meter's card also holds conversation memory; the allowance reads from its own section.
    const answers = card.locator('.oak-usage-card__section[aria-label="Answers left"]');
    assert.equal(await card.locator(".oak-usage-card__section").count(), 2, "answers, then memory, in one card");
    assert.equal(await answers.locator(".oak-usage-card__count strong").innerText(), "3");
    assert.match(await answers.locator(".oak-usage-card__detail").innerText(), /Full now|Next answer back at|every 4 hours|30 days after/);
    for (const name of ["Ask Steve for more", "Have a grant code", "Use my OpenRouter account"])
      assert.equal(await card.getByRole("button", { name }).count(), 1, `${name} is offered`);
    // Each action reuses the funding panel's existing flow: the grant code opens its field, focused.
    await card.getByRole("button", { name: "Have a grant code" }).click();
    const field = page.locator("#oak-grant-code");
    await field.waitFor({ state: "visible", timeout: 3000 });
    // The panel focuses its heading as it opens and the field one frame later, so the focus is awaited.
    assert.equal(await page.waitForFunction(() => document.activeElement?.id === "oak-grant-code", null, { timeout: 3000 }).then(() => true, () => false), true, "the grant field takes focus");
  });
});

test("Q11-G2 OpenRouter shows its bundled favicon and name in the funding choice and the allowance popover", async () => {
  assert.ok(existsSync("public/assets/brand-icons/openrouter.png"), "the favicon is bundled locally");
  const funding = read("src/components/agent/OakFundingControl.tsx");
  assert.match(funding, /RadioCard value="visitor" media=\{<OakOpenRouterMark \/>\} title="My OpenRouter account"/);
  assert.doesNotMatch(funding, /icon="key" title="My OpenRouter account"/, "no generic key glyph for the provider");
  await withPage({ width: 1440, height: 900 }, async page => {
    await open(page, "funding");
    const choice = page.locator(".oak-funding .ui-radio-card", { hasText: "My OpenRouter account" });
    await choice.waitFor({ state: "visible" });
    const src = await choice.locator("img.oak-funding__mark").getAttribute("src");
    assert.equal(src, "/assets/brand-icons/openrouter.png", "bundled, never hotlinked");
    assert.equal(await choice.locator("img.oak-funding__mark").evaluate(node => node.complete && node.naturalWidth > 0), true, "the favicon loads");
    await open(page, "allowance-guest");
    await page.getByRole("button", { name: /^Answers left:/ }).click();
    const action = page.locator(".oak-usage-card").getByRole("button", { name: "Use my OpenRouter account" });
    await action.waitFor({ state: "visible", timeout: 3000 });
    assert.equal(await action.locator("img").getAttribute("src"), "/assets/brand-icons/openrouter.png");
  });
});

test("Q11-G4 the documents panel offers Paste from clipboard and a sample, and a failed file keeps its row with Retry", async () => {
  const { oakSampleDocument } = loadTsx("src/components/agent/OakDocumentsPanel.tsx");
  assert.ok(oakSampleDocument.length > 200 && /Requirements/.test(oakSampleDocument), "the sample is a real role to try");
  await withPage({ width: 1440, height: 900 }, async page => {
    await open(page, "document-upload");
    await page.getByRole("button", { name: "Paste from clipboard" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Try a sample role" }).count(), 1);
    // Importing the exact URL the page loaded (Vite may add an HMR query) shares its module instance, so the fixture reaches the mounted panel.
    await page.evaluate(async () => {
      const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakDocumentsWorkspace\.ts(\?|$)/.test(name));
      const { getOakDocumentsController } = await import(url ?? "/src/lib/oakDocumentsWorkspace.ts");
      getOakDocumentsController().setFixture({ stagedFiles: ["role-description.pdf"], stagedSizes: [1200], failedFiles: ["role-description.pdf"], pending: false, error: "Document preparation could not finish." });
    });
    const row = page.getByRole("list", { name: "Selected files" }).locator("[data-slot='attachment']", { hasText: "role-description.pdf" });
    await row.waitFor({ state: "visible", timeout: 3000 });
    assert.equal(await row.getAttribute("data-state"), "error", "the failed file keeps its row, marked");
    assert.match(await row.innerText(), /Could not prepare/);
    assert.equal(await row.getByRole("button", { name: "Retry role-description.pdf" }).count(), 1);
    assert.equal(await row.getByRole("button", { name: "Remove role-description.pdf" }).count(), 1);
  });
});

test("Q11-G5 grant results say what happened and what next, and both gallery states render them", async () => {
  const { oakGrantNotices } = loadTsx("src/components/agent/OakGrantRedeem.tsx");
  const ok = oakGrantNotices.redeemed(20), miss = oakGrantNotices.failed("That code does not look right. Check it and try again.");
  assert.equal(ok.title, "Added 20 answers"); assert.match(ok.text, /Ask your next question/);
  assert.equal(miss.title, "That code did not work"); assert.match(miss.text, /Nothing was used up\. If it still fails, ask Steve for a new one\./);
  await withPage({ width: 1440, height: 900 }, async page => {
    for (const [state, text] of [["grant-redeemed", "Added 20 answers"], ["grant-invalid", "That code did not work"]]) {
      await open(page, state);
      const result = page.locator(".oak-grant__result");
      await result.waitFor({ state: "visible", timeout: 3000 });
      assert.match(await result.innerText(), new RegExp(text));
    }
  });
});
